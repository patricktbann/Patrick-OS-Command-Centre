/**
 * Prepared PostgreSQL transaction adapter. No database connection is opened here.
 * The caller must supply an authorized pg-compatible pool.
 */
export function createDurableApprovalRepository(pool) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('POOL_REQUIRED');
  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return Object.freeze({
    async create({ id, taskId, scope, risk, expiresAt, principalEmail }) {
      if (!id || !taskId || !scope || !expiresAt || !principalEmail || !['LOW','MEDIUM','HIGH'].includes(risk)) throw new Error('INVALID_REQUEST');
      return transaction(async db => {
        await db.query(
          'INSERT INTO ai_email_approval_request(request_id,task_id,scope_text,risk,expires_at,principal_email) VALUES($1,$2,$3,$4,$5,$6)',
          [id,taskId,scope,risk,expiresAt,principalEmail]
        );
        await db.query('INSERT INTO ai_email_approval_event(request_id,action) VALUES($1,$2)',[id,'REQUESTED']);
        return { id, status: 'PENDING' };
      });
    },
    async decide({ id, status, providerMessageId }) {
      if (!['APPROVED','REJECTED','REVISION_REQUESTED'].includes(status) || !id || !providerMessageId) throw new Error('INVALID_DECISION');
      return transaction(async db => {
        const result = await db.query(
          "UPDATE ai_email_approval_request SET status=$2,decided_at=now() WHERE request_id=$1 AND status='PENDING' AND expires_at>now() AND ($2<>'APPROVED' OR risk='LOW') RETURNING request_id",
          [id,status]
        );
        if (result.rowCount !== 1) throw new Error('NOT_PENDING_OR_NOT_AUTHORIZED');
        await db.query('INSERT INTO ai_email_approval_event(request_id,provider_message_id,action) VALUES($1,$2,$3)',[id,providerMessageId,status]);
        return { id, status };
      });
    },
    async release(id) {
      if (!id) throw new Error('INVALID_REQUEST');
      return transaction(async db => {
        const result = await db.query(
          "UPDATE ai_email_approval_request SET status='RELEASED',released_at=now() WHERE request_id=$1 AND status='APPROVED' AND risk='LOW' AND expires_at>now() RETURNING task_id,scope_text",
          [id]
        );
        if (result.rowCount !== 1) throw new Error('RELEASE_DENIED');
        await db.query('INSERT INTO ai_email_approval_event(request_id,action) VALUES($1,$2)',[id,'RELEASED']);
        return { requestId:id, taskId:result.rows[0].task_id, approvedScope:result.rows[0].scope_text };
      });
    }
  });
}
