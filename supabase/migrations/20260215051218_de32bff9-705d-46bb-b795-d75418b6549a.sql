ALTER TABLE contacts DROP CONSTRAINT contacts_status_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check 
  CHECK (status = ANY (ARRAY[
    'queued', 'calling', 'completed', 'failed', 
    'no_answer', 'voicemail', 'busy',
    'cancelled', 'dnc', 'disconnected', 
    'call_me_later', 'not_available'
  ]));