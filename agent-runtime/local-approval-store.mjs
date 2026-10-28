import { DatabaseSync } from 'node:sqlite';
/** Local UAT persistence. Not a substitute for production Postgres or Gmail auth. */
export function createLocalApprovalStore(filename) {
  if (!filename || filename === ':memory:' && process.env.NODE_ENV === 'production') throw Error('PERSISTENT_PATH_REQUIRED');
  const db=new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_request (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scope TEXT NOT NULL,
      risk TEXT NOT NULL CHECK(risk IN ('LOW','MEDIUM','HIGH')),
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
    );
    CREATE TABLE IF NOT EXISTS approval_event (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL,
      message_id TEXT UNIQUE, action TEXT NOT NULL,
      FOREIGN KEY(request_id) REFERENCES approval_request(id)
    );
  `);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value=fn();db.exec('COMMIT');return value; }
    catch(e) { db.exec('ROLLBACK');throw e; }
  }
  return Object.freeze({
    create({id,taskId,scope,risk='LOW',expiresAt}) {
      if(!id||!taskId||!scope||!['LOW','MEDIUM','HIGH'].includes(risk)||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw Error('INVALID_REQUEST');
      return transaction(()=>{
        db.prepare('INSERT INTO approval_request(id,task_id,scope,risk,expires_at) VALUES(?,?,?,?,?)').run(id,taskId,scope,risk,expiresAt);
        db.prepare('INSERT INTO approval_event(request_id,action) VALUES(?,?)').run(id,'REQUESTED');
        return {id,status:'PENDING'};
      });
    },
    decide({id,status,messageId}) {
      if(!id||!messageId||!['APPROVED','REJECTED','REVISION_REQUESTED'].includes(status))throw Error('INVALID_DECISION');
      return transaction(()=>{
        const result=db.prepare("UPDATE approval_request SET status=? WHERE id=? AND status='PENDING' AND expires_at>? AND (?<>'APPROVED' OR risk='LOW')").run(status,id,new Date().toISOString(),status);
        if(result.changes!==1)throw Error('DECISION_DENIED');
        db.prepare('INSERT INTO approval_event(request_id,message_id,action) VALUES(?,?,?)').run(id,messageId,status);
        return {id,status};
      });
    },
    release(id) {
      return transaction(()=>{
        const row=db.prepare("SELECT task_id,scope FROM approval_request WHERE id=? AND status='APPROVED' AND risk='LOW' AND expires_at>?").get(id,new Date().toISOString());
        if(!row)throw Error('RELEASE_DENIED');
        db.prepare("UPDATE approval_request SET status='RELEASED' WHERE id=? AND status='APPROVED'").run(id);
        db.prepare('INSERT INTO approval_event(request_id,action) VALUES(?,?)').run(id,'RELEASED');
        return {requestId:id,taskId:row.task_id,approvedScope:row.scope};
      });
    },
    get(id){return db.prepare('SELECT * FROM approval_request WHERE id=?').get(id)||null;},
    events(id){return db.prepare('SELECT action,message_id FROM approval_event WHERE request_id=? ORDER BY seq').all(id);},
    close(){db.close();}
  });
}
