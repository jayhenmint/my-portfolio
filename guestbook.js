(function () {
  'use strict';

  // This is a public browser key. Database permissions are enforced by RLS.
  const SUPABASE_URL = 'https://byooreshpzalbezsdump.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_s6P9Ae4mgFkBLiSOCOt44g_Mr0wJ_vX';
  const endpoint = SUPABASE_URL + '/rest/v1/guestbook';
  const form = document.getElementById('guestbook-form');
  const nameInput = document.getElementById('guestbook-name');
  const messageInput = document.getElementById('guestbook-message');
  const sendButton = document.getElementById('guestbook-send');
  const refreshButton = document.getElementById('guestbook-refresh');
  const sendStatus = document.getElementById('guestbook-send-status');
  const loadStatus = document.getElementById('guestbook-load-status');
  const list = document.getElementById('guestbook-list');
  let sending = false;
  let loadVersion = 0;

  function status(element, message, error = false) {
    element.textContent = message;
    element.dataset.state = error ? 'error' : 'info';
  }

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        signal: controller.signal,
        headers: { apikey: PUBLISHABLE_KEY, ...options.headers }
      });
      if (!response.ok) throw new Error('Guestbook request failed');
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function renderMessages(messages) {
    const fragment = document.createDocumentFragment();
    for (const entry of messages.slice(0, 20)) {
      const item = document.createElement('li');
      item.className = 'guestbook-entry';
      const header = document.createElement('div');
      header.className = 'guestbook-entry-header';
      const name = document.createElement('strong');
      name.textContent = entry.name;
      const time = document.createElement('time');
      const date = new Date(entry.created_at);
      if (Number.isFinite(date.getTime())) {
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      } else {
        time.textContent = 'Date unavailable';
      }
      const message = document.createElement('p');
      // Never interpret visitor-supplied strings as HTML.
      message.textContent = entry.message;
      header.append(name, time);
      item.append(header, message);
      fragment.append(item);
    }
    list.replaceChildren(fragment);
  }

  async function loadMessages() {
    const version = ++loadVersion;
    refreshButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    status(loadStatus, 'Loading messages…');
    try {
      const messages = await request(endpoint + '?select=id,name,message,created_at&order=created_at.desc,id.desc&limit=20');
      if (!Array.isArray(messages)) throw new Error('Invalid response');
      if (version !== loadVersion) return;
      renderMessages(messages);
      status(loadStatus, messages.length ? 'Latest ' + messages.length + ' messages · newest first' : 'No messages yet. Be the first to say hello.');
    } catch (_) {
      if (version !== loadVersion) return;
      status(loadStatus, 'Messages are temporarily unavailable. Please try Refresh in a moment.', true);
    } finally {
      if (version === loadVersion) {
        refreshButton.disabled = false;
        list.setAttribute('aria-busy', 'false');
      }
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (sending) return;
    const name = nameInput.value.trim();
    const message = messageInput.value.trim();
    if (Array.from(name).length < 1 || Array.from(name).length > 60) {
      status(sendStatus, 'Please enter a name between 1 and 60 characters.', true);
      nameInput.focus();
      return;
    }
    if (Array.from(message).length < 1 || Array.from(message).length > 500) {
      status(sendStatus, 'Please enter a message between 1 and 500 characters.', true);
      messageInput.focus();
      return;
    }
    sending = true;
    sendButton.disabled = true;
    nameInput.disabled = true;
    messageInput.disabled = true;
    status(sendStatus, 'Sending your message…');
    try {
      const rows = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ name, message })
      });
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Invalid save response');
      form.reset();
      status(sendStatus, 'Thanks! Your message has been saved.');
      await loadMessages();
    } catch (_) {
      status(sendStatus, 'We could not confirm your message was saved. Refresh the messages before trying again; your draft is still here.', true);
    } finally {
      sending = false;
      sendButton.disabled = false;
      nameInput.disabled = false;
      messageInput.disabled = false;
    }
  });

  refreshButton.addEventListener('click', loadMessages);
  sendButton.disabled = false;
  loadMessages();
})();
