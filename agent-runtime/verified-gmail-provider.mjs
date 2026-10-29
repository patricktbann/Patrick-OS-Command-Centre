export function createVerifiedGmailThreadProvider({readThread, verifyMessage}) {
  if (typeof readThread !== 'function' || typeof verifyMessage !== 'function') throw Error('INVALID_PROVIDER_CONFIG');
  return Object.freeze({
    async listThreadMessages(threadId) {
      if (!threadId || typeof threadId !== 'string') throw Error('INVALID_THREAD_ID');
      const messages = await readThread(threadId);
      if (!Array.isArray(messages)) throw Error('INVALID_PROVIDER_RESPONSE');
      return messages.filter(message => message && message.threadId === threadId && verifyMessage(message) === true);
    }
  });
}
