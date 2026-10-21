// App entry: open storage, load (and migrate) data, build the shell, run the router.

import { h } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/dom.js';
import { createStore } from './store.js';
import { openAdapter, loadWithMigration } from './storage.js';
import { toISO } from './core/dates.js';
import { mountToday } from './views/today.js';
import { mountProgress } from './views/progress.js';
import { mountGuide } from './views/guide.js';
import { mountSettings, applyTheme, savedTheme } from './views/settings.js';
import { showOnboarding } from './views/onboarding.js';

const NAV = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'guide', label: 'Plan', icon: 'guide' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const ROUTES = { today: mountToday, progress: mountProgress, guide: mountGuide, settings: mountSettings };

applyTheme(savedTheme());

async function boot() {
  const adapter = await openAdapter();
  const store = createStore(adapter, { onError: () => toast('Could not save. Storage may be full or blocked in this browser.') });
  const { data, migrated } = await loadWithMigration(adapter);
  store.init(data);
  navigator.storage?.persist?.().catch(() => {}); // ask the browser not to evict our data

  const root = document.getElementById('main');
  const now = () => new Date();
  let destroy = () => {};
  let renderedDay = toISO(now());

  const navigate = (path) => {
    const target = `#${path}`;
    if (location.hash === target) route(); else location.hash = target;
  };
  const ctx = { store, adapter, root, now, navigate, refresh: () => route() };

  function parse() {
    const [name = 'today', arg] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: ROUTES[name] ? name : 'today', arg };
  }

  function route() {
    destroy();
    const { name, arg } = parse();
    renderedDay = toISO(now());
    if (!store.state.settings.onboarded) {
      root.replaceChildren();
      if (!document.querySelector('.onboard')) showOnboarding({ store, now, onDone: route });
      markNav(name);
      return;
    }
    destroy = ROUTES[name](ctx, arg) || (() => {});
    markNav(name);
    window.scrollTo(0, 0);
  }

  function markNav(active) {
    document.querySelectorAll('[data-nav]').forEach((b) => {
      if (b.dataset.nav === active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  const navButton = (item, withIcon = true) =>
    h('button', { class: 'nav-item', type: 'button', dataset: { nav: item.id }, onclick: () => navigate(`/${item.id}`) },
      h('span', { class: 'pill-bg' }, icon(item.icon)), item.label);

  document.getElementById('rail').replaceChildren(
    h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), 'Steady'),
    h('nav', { 'aria-label': 'Main', style: { display: 'contents' } }, NAV.map((n) => navButton(n))),
    h('div', { class: 'rail-foot' }, 'Private by design. Your data never leaves this device.'));
  document.getElementById('tabbar').replaceChildren(...NAV.map((n) => navButton(n)));

  window.addEventListener('hashchange', route);
  // flush pending writes when the page is hidden, and refresh if the day rolled over
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
    else if (toISO(now()) !== renderedDay && store.state.settings.onboarded) route();
  });
  window.addEventListener('pagehide', () => store.flush());

  route();
  if (migrated) toast('Welcome back. Your earlier data was carried over.');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('main').replaceChildren(h('p', { class: 'card' }, 'Something went wrong starting Steady. Try reloading the page.'));
});
