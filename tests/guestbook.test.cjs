const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'guestbook.js'), 'utf8');

class Element {
  constructor() { this.children = []; this.dataset = {}; this.listeners = {}; this.value = ''; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(fragment) { this.children = fragment.children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() { this.focused = true; }
  set innerHTML(_) { throw new Error('Untrusted HTML must never be interpreted'); }
}

const flush = () => new Promise(resolve => setImmediate(resolve));
async function app(fetcher) {
  const elements = {};
  for (const suffix of ['form', 'name', 'message', 'send', 'refresh', 'send-status', 'load-status', 'list']) {
    elements[suffix] = new Element();
  }
  elements.form.reset = () => { elements.name.value = ''; elements.message.value = ''; };
  const calls = [];
  const context = vm.createContext({
    document: {
      getElementById: id => elements[id.replace('guestbook-', '')],
      createElement: () => new Element(),
      createDocumentFragment: () => new Element()
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return fetcher(url, options);
    },
    AbortController, setTimeout, clearTimeout, Date
  });
  vm.runInContext(source, context);
  await flush();
  return { elements, calls, submit: () => elements.form.listeners.submit({ preventDefault() {} }) };
}
const ok = rows => ({ ok: true, json: async () => rows });

test('loads only the latest 20 and renders malicious-looking names and messages as text', async () => {
  const attack = '<img src=x onerror="alert(1)">';
  const rows = Array.from({ length: 25 }, (_, id) => ({ id, name: attack, message: '<script>alert(1)</script>', created_at: '2026-10-31T12:00:00Z' }));
  const { elements, calls } = await app(() => ok(rows));
  assert.match(calls[0].url, /order=created_at.desc,id.desc&limit=20/);
  assert.match(calls[0].options.headers.apikey, /^sb_publishable_/);
  assert.equal(elements.list.children.length, 20);
  assert.equal(elements.list.children[0].children[0].children[0].textContent, attack);
  assert.equal(elements.list.children[0].children[1].textContent, '<script>alert(1)</script>');
});

test('rejects blank and oversized submissions before making a POST', async () => {
  const { elements, calls, submit } = await app(() => ok([]));
  elements.name.value = '   '; elements.message.value = 'Hello';
  await submit();
  assert.equal(elements.name.focused, true);
  elements.name.value = 'a'.repeat(61);
  await submit();
  elements.name.value = 'Visitor'; elements.message.value = 'm'.repeat(501);
  await submit();
  assert.equal(elements.message.focused, true);
  assert.equal(calls.length, 1);
});

test('sends trimmed text without client-supplied IDs or dates and refreshes after success', async () => {
  const row = { name: 'Visitor', message: 'Hello', created_at: '2026-10-31T12:00:00Z' };
  let saved = false;
  const { elements, calls, submit } = await app((url, options) => {
    if (options.method === 'POST') { saved = true; return ok([row]); }
    return ok(saved ? [row] : []);
  });
  elements.name.value = ' Visitor '; elements.message.value = ' Hello ';
  await submit();
  const post = calls.find(call => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(post.options.body), { name: 'Visitor', message: 'Hello' });
  assert.equal(elements.name.value, '');
  assert.equal(elements.list.children.length, 1);
  assert.match(elements['send-status'].textContent, /saved/);
  assert.equal(elements.send.disabled, false);
});

test('keeps the draft on network failure and allows a retry', async () => {
  const { elements, submit } = await app((url, options) => {
    if (options.method === 'POST') throw new Error('Network unavailable');
    return ok([]);
  });
  elements.name.value = 'Visitor'; elements.message.value = 'Keep my draft';
  await submit();
  assert.equal(elements.message.value, 'Keep my draft');
  assert.equal(elements.send.disabled, false);
  assert.equal(elements.name.disabled, false);
  assert.match(elements['send-status'].textContent, /could not confirm/);
});

test('shows an error and restores refresh when messages cannot be loaded', async () => {
  const { elements } = await app(() => ({ ok: false }));
  assert.equal(elements['load-status'].dataset.state, 'error');
  assert.equal(elements.refresh.disabled, false);
  assert.equal(elements.list['aria-busy'], 'false');
});
