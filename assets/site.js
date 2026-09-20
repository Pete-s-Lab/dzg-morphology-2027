(() => {
  const SUPABASE_URL = 'https://urlzzelymuhxtyqotjgb.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dMqqqHqrqPsBwE0e-6i7Dw_4791WWqz';
  const TURNSTILE_SITE_KEY = '0x4AAAAAAE9vNdNI1GH3vLQM';

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
          empty.textContent = 'Schedule to be announced';
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

  const registrationForm = document.querySelector('#registration-form');
  if (registrationForm) {
    setupRegistrationConsent(registrationForm);
    registrationForm.addEventListener('submit', submitRegistration);
  }

  const abstractForm = document.querySelector('#abstract-form');
  if (abstractForm) {
    setupAbstractForm(abstractForm);
    abstractForm.addEventListener('submit', submitAbstract);
  }

  function setupRegistrationConsent(form) {
    const dietary = form.elements.dietary_requirements;
    const accessibility = form.elements.accessibility_requirements;
    const consent = form.elements.sensitive_data_consent;
    const consentField = form.querySelector('#sensitive-consent-field');

    if (!dietary || !accessibility || !consent || !consentField) return;

    const update = () => {
      const used =
        dietary.value.trim() !== '' ||
        accessibility.value.trim() !== '';

      consentField.hidden = !used;
      consent.required = used;

      if (!used) {
        consent.checked = false;
      }
    };

    dietary.addEventListener('input', update);
    dietary.addEventListener('change', update);
    accessibility.addEventListener('input', update);
    accessibility.addEventListener('change', update);

    update();
  }

  async function submitRegistration(event) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const status = form.querySelector('.status');
    const button = form.querySelector('button[type="submit"]');

    const sensitiveFieldsUsed =
      form.elements.dietary_requirements.value.trim() !== '' ||
      form.elements.accessibility_requirements.value.trim() !== '';

    const sensitiveConsent = form.elements.sensitive_data_consent.checked;

    if (sensitiveFieldsUsed && !sensitiveConsent) {
      status.textContent = 'Please give explicit consent if you provide dietary or accessibility information.';
      form.elements.sensitive_data_consent.focus();
      return;
    }

    const turnstileToken = getTurnstileToken(form);

    if (!turnstileToken) {
      status.textContent = 'Please complete the bot verification.';
      return;
    }

    const dzgValue = form.elements.dzg_member.value;
    const dinnerValue = form.elements.conference_dinner.value;

    const payload = {
      turnstile_token: turnstileToken,
      first_name: form.elements.first_name.value.trim(),
      last_name: form.elements.last_name.value.trim(),
      email: form.elements.email.value.trim(),
      institution: form.elements.institution.value.trim(),
      department: form.elements.department.value.trim(),
      city: form.elements.city.value.trim(),
      country: form.elements.country.value.trim(),
      career_stage: form.elements.career_stage.value,
      dzg_member: dzgValue === '' ? null : dzgValue === 'yes',
      conference_dinner: dinnerValue === 'undecided' ? null : dinnerValue === 'yes',
      dietary_requirements: form.elements.dietary_requirements.value.trim(),
      accessibility_requirements: form.elements.accessibility_requirements.value.trim(),
      comments: form.elements.comments.value.trim(),
      privacy_accepted: form.elements.privacy_acknowledgement.checked,
      sensitive_data_consent: sensitiveConsent
    };

    setSubmitting(button, status, true, 'Submitting registration…');

    try {
      await postToFunction('submit-registration', payload);

      form.reset();
      resetTurnstile('#turnstile-registration');
      status.textContent = 'Registration submitted successfully.';
    } catch (error) {
      resetTurnstile('#turnstile-registration');
      status.textContent = error.message || 'Registration could not be submitted.';
    } finally {
      button.disabled = false;
    }
  }

  async function submitAbstract(event) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const status = form.querySelector('.status');
    const button = form.querySelector('button[type="submit"]');

    const turnstileToken = getTurnstileToken(form);

    if (!turnstileToken) {
      status.textContent = 'Please complete the bot verification.';
      return;
    }

    const blocks = [...form.querySelectorAll('.author-block')];

    const authors = blocks.map(block => {
      return block.querySelector('[data-author-name]').value.trim();
    });

    const affiliations = blocks.map((block, index) => {
      const affiliation = block.querySelector('[data-author-affiliation]').value.trim();
      return `${authors[index]}: ${affiliation}`;
    });

    const corresponding = form.querySelector('[data-author-corresponding]:checked');
    const presenting = form.querySelector('[data-author-presenting]:checked');

    if (!corresponding || !presenting) {
      status.textContent = 'Please select one corresponding author and one presenting author.';
      return;
    }

    const correspondingBlock = corresponding.closest('.author-block');
    const presentingBlock = presenting.closest('.author-block');

    const correspondingAuthor =
      correspondingBlock.querySelector('[data-author-name]').value.trim();

    const presentingAuthor =
      presentingBlock.querySelector('[data-author-name]').value.trim();

    const payload = {
      turnstile_token: turnstileToken,
      submitter_email: form.elements.submitter_email.value.trim(),
      title: form.elements.title.value.trim(),
      authors: authors.join('; '),
      affiliations: affiliations.join('; '),
      presenting_author: presentingAuthor,
      corresponding_author: correspondingAuthor,
      presenter_career_stage: form.elements.presenter_career_stage.value,
      presentation_type: form.elements.presentation_type.value,
      abstract_text: form.elements.abstract.value.trim(),
      keywords: form.elements.keywords.value.trim(),
      comments: form.elements.comments.value.trim(),
      privacy_accepted: form.elements.privacy_acknowledgement.checked
    };

    setSubmitting(button, status, true, 'Submitting abstract…');

    try {
      const result = await postToFunction('submit-abstract', payload);

      form.reset();
      resetTurnstile('#turnstile-abstract');
      setupAbstractCounterAfterReset(form);

      status.textContent =
        `Abstract submitted successfully (${result.word_count} words).`;
    } catch (error) {
      resetTurnstile('#turnstile-abstract');
      status.textContent = error.message || 'Abstract could not be submitted.';
    } finally {
      button.disabled = false;
    }
  }

  async function postToFunction(functionName, payload) {
    if (
      SUPABASE_PUBLISHABLE_KEY.startsWith('PASTE_') ||
      TURNSTILE_SITE_KEY.startsWith('PASTE_')
    ) {
      throw new Error('Website API keys have not been configured yet.');
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify(payload)
      }
    );

    let body = {};

    try {
      body = await response.json();
    } catch {
      // Keep the fallback error below.
    }

    if (!response.ok) {
      throw new Error(body.error || `Submission failed (HTTP ${response.status}).`);
    }

    return body;
  }

  function getTurnstileToken(form) {
    const responseField = form.querySelector(
      'input[name="cf-turnstile-response"]'
    );

    return responseField?.value?.trim() || '';
  }

  function resetTurnstile(selector) {
    const container = document.querySelector(selector);
    if (!window.turnstile || !container) return;

    try {
      window.turnstile.reset(container);
    } catch (error) {
      console.error('Could not reset Turnstile widget:', error);
    }
  }

  function setSubmitting(button, status, submitting, text) {
    button.disabled = submitting;
    if (status) status.textContent = text;
  }

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
      abstractBox.setCustomValidity(
        over ? 'Please shorten the abstract to 200 words or fewer.' : ''
      );

      if (over) submitButton.disabled = true;
      else if (!submitButton.dataset.submitting) submitButton.disabled = false;
    }

    function renumberAuthors() {
      [...authors.querySelectorAll('.author-block')].forEach((block, index) => {
        const n = index + 1;

        block.dataset.author = n;
        block.querySelector('.author-number').textContent = `Author ${n}`;

        const name = block.querySelector('[data-author-name]');
        const affiliation = block.querySelector('[data-author-affiliation]');
        const corresponding = block.querySelector('[data-author-corresponding]');
        const presenting = block.querySelector('[data-author-presenting]');

        name.name = `author_${n}_name`;
        affiliation.name = `author_${n}_affiliation`;
        corresponding.value = String(n);
        presenting.value = String(n);

        block.querySelector('.remove-author').hidden =
          authors.children.length === 1;
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

    authors.addEventListener('click', event => {
      if (!event.target.matches('.remove-author')) return;

      const block = event.target.closest('.author-block');
      block.remove();

      renumberAuthors();
    });

    abstractBox.addEventListener('input', updateCounter);

    updateCounter();
    renumberAuthors();
  }

  function setupAbstractCounterAfterReset(form) {
    const abstractBox = form.querySelector('#abstract-text');
    const counter = form.querySelector('#word-counter');

    abstractBox.setCustomValidity('');
    counter.textContent = '0 / 200 words';
    counter.classList.remove('over');
  }
})();
