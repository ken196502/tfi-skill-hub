(() => {
  const header = document.querySelector('.site-header');
  const menuTrigger = document.querySelector('#hubMenuTrigger');
  const themeTrigger = document.querySelector('#hubThemeTrigger');
  const themeOptions = document.querySelector('#hubThemeOptions');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let theme = 'dark';
  try {
    const savedTheme = localStorage.getItem('industry-map-shell-theme');
    if (['light', 'dark', 'system'].includes(savedTheme)) theme = savedTheme;
  } catch {}

  function applyTheme() {
    document.documentElement.dataset.hubTheme = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
    themeOptions.querySelectorAll('[data-hub-theme]').forEach(option => option.setAttribute('aria-selected', String(option.dataset.hubTheme === theme)));
  }

  function closeMenu() {
    header.removeAttribute('data-menu-open');
    menuTrigger.setAttribute('aria-expanded', 'false');
  }

  function closeOptions(trigger, options) {
    trigger.setAttribute('aria-expanded', 'false');
    options.hidden = true;
  }

  window.updateSiteNavigation = currentLanguage => {
    const isEnglish = currentLanguage === 'en';
    const labels = isEnglish
      ? { home: 'Home', skills: 'Skills', knowledge: 'Hubei Industry KB Demo', favorites: 'Favorites', login: 'Sign in', light: 'Light', dark: 'Dark', system: 'System', rights: 'All rights reserved.' }
      : { home: '首页', skills: '技能库', knowledge: '湖北产业知识库demo', favorites: '我的收藏', login: '登录', light: '浅色', dark: '深色', system: '跟随系统', rights: '保留所有权利。' };
    document.querySelectorAll('[data-hub-label]').forEach(element => { element.textContent = labels[element.dataset.hubLabel]; });
    document.querySelector('#hubNavigation').setAttribute('aria-label', isEnglish ? 'Skill Hub navigation' : 'Skill Hub 主导航');
    menuTrigger.setAttribute('aria-label', isEnglish ? 'Menu' : '菜单');
    themeTrigger.setAttribute('aria-label', isEnglish ? 'Change theme' : '切换主题');
    themeOptions.setAttribute('aria-label', isEnglish ? 'Navigation theme' : '导航主题');
  };

  document.addEventListener('click', event => {
    const target = event.target;
    if (target.closest('#hubMenuTrigger')) {
      const expanded = menuTrigger.getAttribute('aria-expanded') === 'true';
      header.dataset.menuOpen = String(!expanded);
      menuTrigger.setAttribute('aria-expanded', String(!expanded));
    } else if (!target.closest('#hubNavigation') || target.closest('#hubNavigation a')) {
      closeMenu();
    }

    if (target.closest('#hubThemeTrigger')) {
      const expanded = themeTrigger.getAttribute('aria-expanded') === 'true';
      themeTrigger.setAttribute('aria-expanded', String(!expanded));
      themeOptions.hidden = expanded;
    } else {
      const option = target.closest('#hubThemeOptions [data-hub-theme]');
      if (option && themeOptions.contains(option)) {
        theme = option.dataset.hubTheme;
        try { localStorage.setItem('industry-map-shell-theme', theme); } catch {}
        applyTheme();
        themeTrigger.focus();
      }
      if (!target.closest('#hubThemePicker') || option) closeOptions(themeTrigger, themeOptions);
    }

    if (!target.closest('#languagePicker')) closeOptions(document.querySelector('#languageTrigger'), document.querySelector('#languageOptions'));
    if (target.closest('[data-language]')) document.querySelector('#languageTrigger').focus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      for (const trigger of header.querySelectorAll('[aria-expanded="true"]')) {
        const options = document.getElementById(trigger.getAttribute('aria-controls'));
        if (options?.contains(document.activeElement)) trigger.focus();
      }
      closeMenu();
      closeOptions(themeTrigger, themeOptions);
      closeOptions(document.querySelector('#languageTrigger'), document.querySelector('#languageOptions'));
      return;
    }
    const trigger = event.target.closest('[aria-haspopup="listbox"]');
    const options = trigger ? document.getElementById(trigger.getAttribute('aria-controls')) : event.target.closest('.hub-options');
    if (!options || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (trigger) {
      header.querySelectorAll('.hub-options').forEach(menu => {
        if (menu !== options) closeOptions(header.querySelector(`[aria-controls="${menu.id}"]`), menu);
      });
      options.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }
    const buttons = [...options.querySelectorAll('button')];
    const currentIndex = buttons.indexOf(document.activeElement);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : currentIndex === -1 ? (event.key === 'ArrowUp' ? buttons.length - 1 : 0) : (currentIndex + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
  });

  systemTheme.addEventListener('change', applyTheme);
  window.addEventListener('hashchange', closeMenu);
  window.matchMedia('(max-width: 767px)').addEventListener('change', closeMenu);
  document.querySelector('#hubCopyrightYear').textContent = new Date().getFullYear();
  applyTheme();
})();
