/** Isolated V3.6 draft-only error type; no executor dependencies. */
export class StaffPilotError extends Error {
 constructor(code,message){super(message);this.name='StaffPilotError';this.code=code;}
}
