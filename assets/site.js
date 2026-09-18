(() => {
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  document.querySelectorAll('[data-current-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });


  const programmeRoot = document.querySelector('#programme');
  if (programmeRoot && Array.isArray(window.DZG_PROGRAMME)) {
    renderProgramme(programmeRoot, window.DZG_PROGRAMME);
  }

  function renderProgramme(root, days) {
    root.innerHTML = '';
    days.forEach(day => {
      const dayEl = document.createElement('section');
      dayEl.className = 'programme-day';

      const dayTitle = document.createElement('h2');
      dayTitle.className = 'programme-day-title';
      dayTitle.textContent = day.day;
      dayEl.appendChild(dayTitle);

      (day.sessions || []).forEach(session => {
        const sessionEl = document.createElement('div');
        sessionEl.className = 'programme-session';

        const sessionTitle = document.createElement('h3');
        sessionTitle.className = 'programme-session-title';
        sessionTitle.textContent = session.title;
        sessionEl.appendChild(sessionTitle);

        const items = session.items || [];
        if (!items.length) {
          const empty = document.createElement('div');
          empty.className = 'programme-empty';
          empty.textContent = 'Schedule to be added';
          sessionEl.appendChild(empty);
        }

        items.forEach(item => {
          const row = document.createElement('div');
          row.className = 'programme-row';

          const time = document.createElement('div');
          time.className = 'programme-time';
          time.textContent = item.time || '—';

          const content = document.createElement('div');
          content.className = 'programme-item';
          const title = document.createElement('strong');
          title.textContent = item.title || '';
          content.appendChild(title);
          if (item.detail) {
            const detail = document.createElement('span');
            detail.textContent = item.detail;
            content.appendChild(detail);
          }

          row.append(time, content);
          sessionEl.appendChild(row);
        });

        dayEl.appendChild(sessionEl);
      });

      root.appendChild(dayEl);
    });
  }

  const form = document.querySelector('#abstract-form');
  if (form) setupAbstractForm(form);

  document.querySelectorAll('form[data-prototype-form]').forEach(f => {
    f.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!f.reportValidity()) return;
      const status = f.querySelector('.status');
      if (status) {
        status.textContent = 'Prototype mode: validation passed. The secure submission endpoint will be connected before launch.';
      }
    });
  });

  function setupAbstractForm(form) {
    const authors = form.querySelector('#authors');
    const addButton = form.querySelector('#add-author');
    const abstractBox = form.querySelector('#abstract-text');
    const counter = form.querySelector('#word-counter');
    const submitButton = form.querySelector('button[type="submit"]');

    function words(text) {
      const cleaned = text.trim();
      return cleaned ? cleaned.split(/\s+/).length : 0;
    }

    function updateCounter() {
      const count = words(abstractBox.value);
      counter.textContent = `${count} / 200 words`;
      const over = count > 200;
      counter.classList.toggle('over', over);
      abstractBox.setCustomValidity(over ? 'Please shorten the abstract to 200 words or fewer.' : '');
      submitButton.disabled = over;
    }

    function renumberAuthors() {
      [...authors.querySelectorAll('.author-block')].forEach((block, index) => {
        const n = index + 1;
        block.dataset.author = n;
        block.querySelector('.author-number').textContent = `Author ${n}`;
        const name = block.querySelector('[data-author-name]');
        const aff = block.querySelector('[data-author-affiliation]');
        const corr = block.querySelector('[data-author-corresponding]');
        name.name = `author_${n}_name`;
        aff.name = `author_${n}_affiliation`;
        corr.value = String(n);
        block.querySelector('.remove-author').hidden = authors.children.length === 1;
      });
    }

    function makeAuthor() {
      const template = form.querySelector('#author-template');
      return template.content.cloneNode(true);
    }

    addButton.addEventListener('click', () => {
      authors.appendChild(makeAuthor());
      renumberAuthors();
    });

    authors.addEventListener('click', (event) => {
      if (!event.target.matches('.remove-author')) return;
      event.target.closest('.author-block').remove();
      renumberAuthors();
    });

    abstractBox.addEventListener('input', updateCounter);
    updateCounter();
    renumberAuthors();
  }
})();
