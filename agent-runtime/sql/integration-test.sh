#!/usr/bin/env bash
set -euo pipefail
# Run against an EPHEMERAL CI PostgreSQL database only; never against production.
: "${PGHOST:?PGHOST required}"
: "${PGDATABASE:?PGDATABASE required}"
: "${PGUSER:?PGUSER required}"
: "${PGPASSWORD:?PGPASSWORD required}"
if [[ "${TSY_EPHEMERAL_CI_DB:-}" != "yes" ]]; then echo "Refusing non-CI database" >&2; exit 2; fi
psql_(){ psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
psql_ -f agent-runtime/sql/001-agent-dispatch.sql
echo "Migration applied to ephemeral PostgreSQL"

# Many concurrent inserts of the SAME task must result in exactly one reservation.
for i in $(seq 1 16); do
  psql_ -c "INSERT INTO agent_task_dispatch(task_id,state) VALUES('TSY-REALPG-001','RESERVED') ON CONFLICT(task_id) DO NOTHING RETURNING task_id" >"/tmp/tsy_reserve_$i" &
done
wait
accepted=$(cat /tmp/tsy_reserve_* | grep -c '^TSY-REALPG-001$' || true)
[[ "$accepted" = 1 ]] || { echo "Expected exactly one reservation, found $accepted" >&2; exit 1; }
count=$(psql_ -c "SELECT count(*) FROM agent_task_dispatch WHERE task_id='TSY-REALPG-001'")
[[ "$count" = 1 ]] || exit 1
echo "PASS: 16 concurrent reservations; exactly 1 accepted"

# Exercise the same atomic state transition and append-only event query as the adapter.
psql_ -c "BEGIN; UPDATE agent_task_dispatch SET state='EXECUTING',executor_run_id='sandbox-run-001',executor_type='ci-fixture',approval_id='dummy-approval-001',started_at=now() WHERE task_id='TSY-REALPG-001' AND state='RESERVED'; INSERT INTO agent_dispatch_audit(task_id,event_type,details) VALUES('TSY-REALPG-001','EXECUTING','{\"executor\":\"ci-fixture\"}'::jsonb); COMMIT;"
state=$(psql_ -c "SELECT state FROM agent_task_dispatch WHERE task_id='TSY-REALPG-001'")
[[ "$state" = "EXECUTING" ]] || exit 1
echo "PASS: transition persisted"

# A duplicate run identifier cannot be assigned to a second task.
psql_ -c "INSERT INTO agent_task_dispatch(task_id,state) VALUES('TSY-REALPG-002','RESERVED')"
if psql_ -c "UPDATE agent_task_dispatch SET state='EXECUTING',executor_run_id='sandbox-run-001' WHERE task_id='TSY-REALPG-002'" >/dev/null 2>&1; then
  echo "FAIL: reused executor run ID" >&2; exit 1
fi
state2=$(psql_ -c "SELECT state FROM agent_task_dispatch WHERE task_id='TSY-REALPG-002'")
[[ "$state2" = "RESERVED" ]] || exit 1
echo "PASS: duplicate executor run ID rejected and transaction rolled back"

# A failed transaction must not leak audit rows or committed state.
if psql_ -c "BEGIN; INSERT INTO agent_dispatch_audit(task_id,event_type) VALUES('TSY-REALPG-002','EXECUTING'); SELECT 1/0; COMMIT;" >/dev/null 2>&1; then
 echo "FAIL: invalid transaction should fail" >&2; exit 1
fi
bad_count=$(psql_ -c "SELECT count(*) FROM agent_dispatch_audit WHERE task_id='TSY-REALPG-002'")
[[ "$bad_count" = 0 ]] || exit 1
echo "PASS: failed transaction rolled back audit event"
echo "TSY PostgreSQL integration tests PASSED on ephemeral database only"
