/* Morgan AI Chat + Vapi Voice Widget — Medical.MyAIworker.online */

(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────
  const CONFIG = {
    botName: 'Morgan',
    companyName: 'Medical.MyAIworker.online',

    // Vapi public keys are designed for browser use.
    vapiPublicKey: 'b300db1b-37d2-4af9-ac4d-77430e594542',
    vapiAssistantId: '255d8fde-8607-450e-b4a6-89339947c619',

    teaserHide: 9000,
  };

  const SYSTEM_PROMPT = `
You are Morgan, the calm, capable AI medical administrator and live demonstration
guide for Medical.MyAIworker.online. You speak with doctors, dentists,
chiropractors, practice owners, office managers, and authorized staff.

The service supports approved administrative work: phone answering, website
conversations, scheduling, reminders, administrative intake, routing, follow-up,
and connected office workflows. Morgan is not a clinician. Never diagnose,
triage symptoms, recommend treatment, interpret medical information, or make
clinical decisions. Direct emergencies to 911 or the visitor's local emergency
service, and route clinical or sensitive questions to qualified practice staff.

This public demonstration has no live access to patient records, calendars,
forms, billing, email, EHR systems, or office workflows. Ask visitors not to share
real patient information. Never claim an action was completed.

Privacy and compliance: Explain that Morgan can be configured with safeguards to
support HIPAA-conscious workflows, including minimum-necessary collection,
approved access, secure integrations, appropriate vendor agreements, and human
oversight. Never promise blanket HIPAA, legal, or regulatory compliance. Compliance
depends on the complete deployment and the practice's policies, contracts,
training, integrations, risk assessment, and daily operations.

Pricing: implementation is regularly $5,000 and is offered for $2,500 through
September 7, 2026. Service is $1,500 per month for the first user and $1,000 per
month for each additional user. The first recurring invoice is sent 30 days after
go-live. Service is month-to-month. There is no monthly checkout on this website.

Keep responses to one to three short spoken sentences. Ask one question at a
time. Use plain English. Never read raw URLs aloud. Say Medical.MyAIworker.online
as "Medical My AI Worker dot online." Lead with the operational outcome most
relevant to the visitor's practice.

First response: "Hi, I'm Morgan, the AI medical administrator for doctors,
dentists, and chiropractors. Please don't share private patient details here.
What would help your office most right now: call coverage, scheduling and
reminders, or smoother intake and routing?"
`.trim();

  // ── STATE ───────────────────────────────────────────────────
  let isOpen = false;
  let vapi = null;
  let vapiActive = false;
  let vapiLoading = false;
  let vapiModulePromise = null;

  const $ = (id) => document.getElementById(id);

  // ── INITIALIZATION ──────────────────────────────────────────
  function init() {
    bindEvents();
    injectMicStyles();
    injectMicNotice();
    scheduleTeaserHide();

    const setup = $('aiw-setup');
    const chat = $('aiw-chat');

    if (setup) setup.style.display = 'none';
    if (chat) chat.style.display = 'flex';

    /*
     * Download the SDK while the visitor reads the page.
     * This does not start a call or consume Vapi minutes.
     */
    if (vapiConfigured()) {
      setTimeout(function () {
        loadVapiModule().catch(function (error) {
          console.error('Morgan Vapi SDK preload failed:', error);
        });
      }, 300);
    }
  }

  function vapiConfigured() {
    return Boolean(CONFIG.vapiPublicKey && CONFIG.vapiAssistantId);
  }

  // ── VAPI SDK ────────────────────────────────────────────────
  function loadVapiModule() {
    if (!vapiModulePromise) {
      vapiModulePromise = import(
        'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.5.2/+esm'
      ).catch(function (error) {
        vapiModulePromise = null;
        throw error;
      });
    }

    return vapiModulePromise;
  }

  function getVapiConstructor(module) {
    if (
      module &&
      module.default &&
      module.default.default &&
      typeof module.default.default === 'function'
    ) {
      return module.default.default;
    }

    if (module && typeof module.default === 'function') {
      return module.default;
    }

    if (typeof module === 'function') {
      return module;
    }

    return null;
  }

  function describeVapiError(error) {
    if (!error) return 'Unknown Vapi error';

    const nested = error.error;

    const directDetail =
      (nested &&
        (nested.message ||
          nested.msg ||
          nested.code ||
          nested.type ||
          nested.statusCode)) ||
      error.message ||
      error.msg ||
      error.code ||
      error.type ||
      error.statusCode;

    if (directDetail) {
      return String(directDetail);
    }

    try {
      const serialized = JSON.stringify(error, function (key, value) {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }

        return value;
      });

      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch (_) {
      // Fall through to String(error).
    }

    return String(error);
  }

  async function createVapiClient() {
    if (vapi) return vapi;

    const module = await loadVapiModule();
    const Vapi = getVapiConstructor(module);

    if (!Vapi) {
      throw new Error('Vapi SDK constructor was not found');
    }

    vapi = new Vapi(CONFIG.vapiPublicKey);

    vapi.on('call-start', handleVapiCallStart);
    vapi.on('call-end', handleVapiCallEnd);
    vapi.on('message', handleVapiMessage);
    vapi.on('error', handleVapiError);

    return vapi;
  }

  // ── VAPI CALL LIFECYCLE ─────────────────────────────────────
  async function startVapiCall() {
    if (vapiActive || vapiLoading) return;

    if (!vapiConfigured()) {
      addBotMessage('Voice is not configured yet.');
      return;
    }

    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      showOpenInBrowserNotice(webviewName() || 'this browser');
      return;
    }

    vapiLoading = true;
    openWindow();
    showMicBanner();
    setVoiceUI(true, 'Connecting to Morgan…');

    try {
      const client = await createVapiClient();

      /*
       * Vapi owns the microphone request.
       * Do not open and close a separate microphone stream here.
       */
      await client.start(CONFIG.vapiAssistantId);
    } catch (error) {
      handleVapiStartFailure(error);
    }
  }

  function stopVapiCall() {
    if (vapi && (vapiActive || vapiLoading)) {
      try {
        vapi.stop();
      } catch (error) {
        console.error('Morgan Vapi stop failed:', error);
      }
    }

    vapiActive = false;
    vapiLoading = false;
    setVoiceUI(false);
  }

  function handleVapiCallStart() {
    vapiActive = true;
    vapiLoading = false;
    setVoiceUI(true, '🎙️ Live — just talk');
  }

  function handleVapiCallEnd() {
    vapiActive = false;
    vapiLoading = false;
    setVoiceUI(false);

    addBotMessageHTML(
      '<strong>Call ended.</strong> Tap the microphone to talk to Morgan again.'
    );
  }

  function handleVapiError(error) {
    const detail = describeVapiError(error);

    console.error('Morgan Vapi error: ' + detail, error);

    vapiActive = false;
    vapiLoading = false;
    setVoiceUI(false);

    addBotMessage(
      'Morgan could not start the voice session. Please try again.'
    );
  }

  function handleVapiStartFailure(error) {
    const detail = describeVapiError(error);

    console.error('Morgan Vapi start failed: ' + detail, error);

    vapiActive = false;
    vapiLoading = false;
    setVoiceUI(false);

    addBotMessage(
      'Morgan could not start the voice session. Please try again.'
    );
  }

  function handleVapiMessage(message) {
    if (!message || message.type !== 'transcript') return;
    if (message.transcriptType !== 'final') return;

    const text =
      message.transcript ||
      message.text ||
      (message.message && message.message.content) ||
      message.transcriptText;

    if (!text) return;

    const role =
      message.role ||
      (message.message && message.message.role) ||
      'assistant';

    if (role === 'user') {
      addUserMessage(text);
      return;
    }

    morganSaid(text);
  }

  // ── PUBLIC VOICE CONTROLS ───────────────────────────────────
  function toggleVoice() {
    if (vapiActive || vapiLoading) {
      stopVapiCall();
      return;
    }

    startVapiCall();
  }

  /*
   * Called by the large "Talk to Morgan" button.
   * One deliberate click opens the widget and starts voice.
   * Nothing starts automatically on page load.
   */
  window.aiwStartVoice = function () {
    openWindow();
    startVapiCall();
  };

  window.aiwDismissVoice = function () {
    stopVapiCall();

    const overlay = $('aiw-voice-overlay');
    if (overlay) overlay.classList.remove('active');
  };

  // ── TEXT INPUT DURING A VAPI CALL ───────────────────────────
  function sendMessage() {
    const input = $('aiw-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    sendText(text);
  }

  function sendText(text) {
    if (!text) return;

    if (!vapiActive || !vapi) {
      addBotMessage(
        'Tap the microphone to start talking with Morgan. Please do not share private patient details in this public demo.'
      );
      return;
    }

    addUserMessage(text);

    try {
      vapi.send({
        type: 'add-message',
        message: {
          role: 'user',
          content: text,
        },
      });
    } catch (error) {
      console.error('Morgan typed-message delivery failed:', error);
      addBotMessage(
        '⚠️ That message could not be added to the voice session.'
      );
    }
  }

  window.aiwSendText = sendText;

  function morganSaid(text) {
    addBotMessageHTML(formatText(text));
  }

  // ── WIDGET EVENTS ───────────────────────────────────────────
  function bindEvents() {
    const fab = $('aiw-fab');
    const teaser = $('aiw-teaser');
    const send = $('aiw-send');
    const input = $('aiw-input');
    const voice = $('aiw-voice-btn');

    if (fab) fab.addEventListener('click', toggleWindow);
    if (teaser) teaser.addEventListener('click', toggleWindow);
    if (send) send.addEventListener('click', sendMessage);
    if (voice) voice.addEventListener('click', toggleVoice);

    if (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      input.addEventListener('input', function () {
        autoResize(input);
      });
    }

    /*
     * The hero prompt is a role="button" div.
     * Give keyboard users the same deliberate start behavior.
     */
    const heroPrompt = document.querySelector('.hero-voice-prompt');

    if (heroPrompt) {
      heroPrompt.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.aiwStartVoice();
        }
      });
    }
  }

  // ── WIDGET WINDOW ───────────────────────────────────────────
  function toggleWindow() {
    isOpen = !isOpen;

    const win = $('aiw-window');
    const fab = $('aiw-fab');
    const teaser = $('aiw-teaser');

    if (win) win.classList.toggle('open', isOpen);

    if (fab) {
      fab.classList.toggle('open', isOpen);
      fab.setAttribute('aria-expanded', String(isOpen));
    }

    if (teaser && isOpen) {
      teaser.classList.add('hidden');
    }

    if (!isOpen && (vapiActive || vapiLoading)) {
      stopVapiCall();
    }
  }

  function openWindow() {
    if (!isOpen) toggleWindow();
  }

  window.aiwToggle = toggleWindow;

  // ── VOICE UI ────────────────────────────────────────────────
  function setVoiceUI(live, label) {
    const voiceButton = $('aiw-voice-btn');
    const input = $('aiw-input');

    if (voiceButton) {
      voiceButton.classList.toggle('listening', Boolean(live));
      voiceButton.setAttribute(
        'aria-label',
        live ? 'End voice call' : 'Start voice call'
      );
      voiceButton.title = live ? 'End voice call' : 'Start voice call';
    }

    if (input) {
      input.placeholder = live
        ? label || '🎙️ Live — just talk'
        : 'Type or speak...';
    }
  }

  // ── MICROPHONE GUIDANCE ─────────────────────────────────────
  function injectMicStyles() {
    if ($('aiw-mic-style')) return;

    const style = document.createElement('style');
    style.id = 'aiw-mic-style';

    style.textContent = `
      .aiw-mic-notice {
        display: flex;
        align-items: flex-start;
        gap: .55rem;
        margin-top: 1.1rem;
        padding: .7rem .95rem;
        border: 1px solid rgba(140, 242, 90, .38);
        background: rgba(140, 242, 90, .08);
        border-radius: 11px;
        color: #d7eccb;
        font-size: .85rem;
        line-height: 1.4;
        max-width: 540px;
      }

      .aiw-mic-notice strong {
        color: #a9f582;
      }

      .aiw-mic-notice .aiw-mic-ico {
        flex: 0 0 auto;
        font-size: 1.05rem;
        line-height: 1.3;
      }

      .aiw-mic-banner {
        margin: 0 0 .8rem;
        padding: .7rem .85rem;
        border: 1px solid rgba(140, 242, 90, .42);
        background: rgba(140, 242, 90, .1);
        border-radius: 11px;
        color: #e2f5d7;
        font-size: .85rem;
        line-height: 1.45;
      }

      .aiw-mic-banner strong {
        color: #bdf79c;
      }

      .aiw-mic-banner .aiw-mic-sub {
        display: block;
        margin-top: .4rem;
        color: #a6c79a;
        font-size: .78rem;
      }

      .aiw-browser-warn {
        margin: 0 0 .8rem;
        padding: .8rem .95rem;
        border: 1px solid rgba(255, 176, 60, .5);
        background: rgba(255, 176, 60, .11);
        border-radius: 11px;
        color: #f6e6cd;
        font-size: .87rem;
        line-height: 1.5;
      }

      .aiw-browser-warn strong {
        color: #ffc978;
      }

      .aiw-browser-warn .aiw-warn-steps {
        display: block;
        margin-top: .45rem;
        color: #dcc6a3;
        font-size: .79rem;
      }

      .aiw-copy-link {
        display: inline-block;
        margin-top: .6rem;
        padding: .42rem .8rem;
        border: 1px solid rgba(255, 176, 60, .6);
        background: rgba(255, 176, 60, .16);
        color: #ffd79a;
        border-radius: 8px;
        font-size: .8rem;
        cursor: pointer;
      }
    `;

    document.head.appendChild(style);
  }

  function injectMicNotice() {
    if ($('aiw-mic-notice')) return;

    const anchor = document.querySelector('.hero-voice-prompt');
    if (!anchor) return;

    const notice = document.createElement('div');
    notice.id = 'aiw-mic-notice';
    notice.className = 'aiw-mic-notice';

    notice.innerHTML =
      '<span class="aiw-mic-ico" aria-hidden="true">🎙️</span>' +
      '<span>Press <strong>Talk to Morgan</strong>, allow microphone ' +
      'access when asked, and speak normally.</span>';

    anchor.insertAdjacentElement('afterend', notice);
  }

  function showMicBanner() {
    const messages = $('aiw-messages');

    if (!messages || $('aiw-mic-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'aiw-mic-banner';
    banner.className = 'aiw-mic-banner';

    banner.innerHTML =
      '🎙️ <strong>Allow microphone access</strong> when your browser asks, ' +
      'then talk to Morgan. Do not share private patient information.' +
      '<span class="aiw-mic-sub">' +
      'If access was previously blocked, open the site permissions beside ' +
      'the address bar, allow the microphone, and reload the page.' +
      '</span>';

    messages.appendChild(banner);
    scrollMessages();
  }

  const WEBVIEWS = [
    [/Instagram/i, 'Instagram'],
    [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
    [/Messenger/i, 'Messenger'],
    [/TikTok|BytedanceWebview|musical_ly/i, 'TikTok'],
    [/Snapchat/i, 'Snapchat'],
    [/LinkedInApp/i, 'LinkedIn'],
    [/Pinterest/i, 'Pinterest'],
    [/WhatsApp/i, 'WhatsApp'],
    [/Twitter/i, 'X'],
    [/\bLine\//i, 'LINE'],
  ];

  function webviewName() {
    const userAgent = navigator.userAgent || '';

    for (const entry of WEBVIEWS) {
      if (entry[0].test(userAgent)) return entry[1];
    }

    if (/Android.*;\s*wv\)/i.test(userAgent)) {
      return 'this app';
    }

    return null;
  }

  function showOpenInBrowserNotice(appName) {
    injectMicStyles();
    openWindow();

    const messages = $('aiw-messages');

    if (!messages || $('aiw-browser-warn')) return;

    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || '');

    const steps = isIOS
      ? 'Use the share or menu button and choose Open in Safari.'
      : 'Use the menu and choose Open in browser or Open in Chrome.';

    const warning = document.createElement('div');
    warning.id = 'aiw-browser-warn';
    warning.className = 'aiw-browser-warn';

    warning.innerHTML =
      '⚠️ <strong>' +
      escapeHTML(appName) +
      ' cannot provide microphone access.</strong>' +
      '<span class="aiw-warn-steps">' +
      steps +
      '</span>' +
      '<span class="aiw-copy-link" id="aiw-copy-link" ' +
      'role="button" tabindex="0">📋 Copy this page link</span>';

    messages.appendChild(warning);

    const copyButton = $('aiw-copy-link');

    if (copyButton) {
      const copyLink = function () {
        const url = window.location.href;

        const complete = function () {
          copyButton.textContent =
            '✅ Link copied — paste it into Safari or Chrome';
        };

        if (
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          navigator.clipboard.writeText(url).then(complete).catch(function () {
            copyButton.textContent = url;
          });
        } else {
          copyButton.textContent = url;
        }
      };

      copyButton.addEventListener('click', copyLink);

      copyButton.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          copyLink();
        }
      });
    }

    scrollMessages();
  }

  // ── CHAT RENDERING ──────────────────────────────────────────
  function addBotMessage(text) {
    addBotMessageHTML(formatText(text));
  }

  function addBotMessageHTML(html) {
    const messages = $('aiw-messages');
    if (!messages) return;

    const message = document.createElement('div');
    message.className = 'aiw-msg bot';

    message.innerHTML =
      '<div class="aiw-mini-avatar">⚖</div>' +
      '<div class="aiw-bubble">' +
      html +
      '</div>';

    messages.appendChild(message);
    scrollMessages();
  }

  function addUserMessage(text) {
    const messages = $('aiw-messages');
    if (!messages) return;

    const message = document.createElement('div');
    message.className = 'aiw-msg user';

    message.innerHTML =
      '<div class="aiw-bubble">' +
      escapeHTML(text) +
      '</div>';

    messages.appendChild(message);
    scrollMessages();
  }

  function scrollMessages() {
    const messages = $('aiw-messages');

    if (messages) {
      messages.scrollTop = messages.scrollHeight;
    }
  }

  function scheduleTeaserHide() {
    setTimeout(function () {
      const teaser = $('aiw-teaser');

      if (teaser && !isOpen) {
        teaser.style.transition = 'opacity .5s';
        teaser.style.opacity = '0';

        setTimeout(function () {
          teaser.classList.add('hidden');
        }, 500);
      }
    }, CONFIG.teaserHide);
  }

  // ── FORMATTING ──────────────────────────────────────────────
  function formatText(value) {
    return escapeHTML(String(value))
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
      )
      .replace(
        /(^|[^"=])(https?:\/\/[^\s<]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener">$2</a>'
      )
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHTML(value);
  }

  function autoResize(element) {
    element.style.height = 'auto';
    element.style.height =
      Math.min(element.scrollHeight, 96) + 'px';
  }

  // ── START ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
