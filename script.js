/**
 * Machines & Cloud - Premium Interactions
 * High-converting enterprise website
 */

(function() {
  'use strict';

  // ============================================
  // NAVBAR SCROLL BEHAVIOR
  // ============================================
  const navbar = document.getElementById('navbar');

  function updateNavbar() {
    // The mobile dialog fixes the body in place. Keep the header's pre-open state.
    if (document.body.classList.contains('nav-open')) return;
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  if (navbar) {
    window.addEventListener('scroll', updateNavbar, { passive: true });
    updateNavbar();
  }

  // ============================================
  // MOBILE NAVIGATION
  // ============================================
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  if (navbar && navToggle && navMenu) {
    const mobileNav = window.matchMedia('(max-width: 1024px)');
    const backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);

    const originalNavRole = navbar.getAttribute('role');
    const originalNavLabel = navbar.getAttribute('aria-label');
    navToggle.type = 'button';
    navToggle.setAttribute('aria-controls', navMenu.id);
    navMenu.tabIndex = -1;
    let isOpen = false;
    let returnFocus = null;
    let scrollPosition = null;
    let previousScrollTop = '';
    let lastMenuFocus = null;
    const inertBefore = new Map();

    function backgroundInert() {
      // Preserve the navigation's ancestor path and toggle while disabling the page.
      for (let branch = navMenu; branch && branch !== document.body; branch = branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling === branch || sibling === backdrop || sibling.contains(navToggle)) continue;
          inertBefore.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
    }

    function focusableLinks() {
      return [navToggle, ...navMenu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && !element.inert && element.getClientRects().length);
    }

    function closeMenu({ restoreFocus = true } = {}) {
      const wasOpen = isOpen;
      isOpen = false;
      navMenu.classList.remove('is-open');
      navToggle.classList.remove('is-active');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Open menu');
      backdrop.hidden = true;
      document.body.classList.remove('nav-open');
      for (const [element, wasInert] of inertBefore) element.inert = wasInert;
      inertBefore.clear();
      if (scrollPosition) {
        if (previousScrollTop) document.body.style.setProperty('--nav-scroll-top', previousScrollTop);
        else document.body.style.removeProperty('--nav-scroll-top');
        window.scrollTo({ ...scrollPosition, behavior: 'instant' });
        scrollPosition = null;
      }
      const mobile = mobileNav.matches;
      const hidingDesktopFocus = !mobile && document.activeElement === navToggle;
      navMenu.hidden = mobile;
      navMenu.inert = mobile;
      if (mobile) {
        navMenu.setAttribute('aria-hidden', 'true');
      } else {
        navMenu.removeAttribute('aria-hidden');
      }
      if (originalNavRole === null) navbar.removeAttribute('role');
      else navbar.setAttribute('role', originalNavRole);
      if (originalNavLabel === null) navbar.removeAttribute('aria-label');
      else navbar.setAttribute('aria-label', originalNavLabel);
      navbar.removeAttribute('aria-modal');
      if (wasOpen && restoreFocus && mobile && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else if (wasOpen && restoreFocus && hidingDesktopFocus) navMenu.querySelector('a[href]')?.focus({ preventScroll: true });
      returnFocus = null;
      updateNavbar();
    }

    function openMenu() {
      if (!mobileNav.matches || isOpen) return;
      returnFocus = navToggle;
      scrollPosition = { left: window.scrollX, top: window.scrollY };
      previousScrollTop = document.body.style.getPropertyValue('--nav-scroll-top');
      navMenu.style.setProperty('--nav-top', `${Math.ceil(navbar.getBoundingClientRect().bottom) + 8}px`);
      document.body.style.setProperty('--nav-scroll-top', `${-scrollPosition.top}px`);
      isOpen = true;
      navMenu.hidden = false;
      navMenu.inert = false;
      navMenu.removeAttribute('aria-hidden');
      // The header X and menu links belong to the same accessible modal boundary.
      navbar.setAttribute('role', 'dialog');
      navbar.setAttribute('aria-label', 'Site navigation');
      navbar.setAttribute('aria-modal', 'true');
      navMenu.classList.add('is-open');
      navToggle.classList.add('is-active');
      navToggle.setAttribute('aria-expanded', 'true');
      navToggle.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('nav-open');
      backdrop.hidden = false;
      backgroundInert();
      navToggle.focus({ preventScroll: true });
    }

    navToggle.addEventListener('click', () => isOpen ? closeMenu() : openMenu());
    backdrop.addEventListener('click', () => closeMenu());
    // Unlock the page before a link's own anchor handler measures or scrolls it.
    navMenu.addEventListener('click', event => {
      if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.target.closest('a[href]')) closeMenu({ restoreFocus: false });
    }, { capture: true });
    document.addEventListener('keydown', event => {
      if (!isOpen) return;
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
      if (event.key !== 'Tab') return;
      const items = focusableLinks();
      const first = items[0] || navMenu;
      const last = items.at(-1) || navMenu;
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    });
    document.addEventListener('focusin', event => {
      if (navMenu.contains(event.target)) lastMenuFocus = event.target;
      else if (event.target !== document.body) lastMenuFocus = null;
      if (isOpen && event.target !== navToggle && !navMenu.contains(event.target)) navToggle.focus({ preventScroll: true });
    });
    mobileNav.addEventListener('change', () => {
      // Responsive CSS can hide the focused link before the media-query event arrives.
      const hidingFocusedMenu = mobileNav.matches && (navMenu.contains(document.activeElement) || (document.activeElement === document.body && lastMenuFocus));
      const hidingFocusedButton = !mobileNav.matches && document.activeElement === navToggle;
      closeMenu({ restoreFocus: false });
      if (hidingFocusedMenu) navToggle.focus({ preventScroll: true });
      else if (hidingFocusedButton) navMenu.querySelector('a[href]')?.focus({ preventScroll: true });
    });
    window.addEventListener('resize', () => { if (isOpen) closeMenu(); });
    window.addEventListener('pagehide', () => closeMenu({ restoreFocus: false }));
    window.addEventListener('pageshow', () => {
      const hidingFocusedMenu = mobileNav.matches && (navMenu.contains(document.activeElement) || (document.activeElement === document.body && lastMenuFocus));
      closeMenu({ restoreFocus: false });
      if (hidingFocusedMenu) navToggle.focus({ preventScroll: true });
    });
    closeMenu({ restoreFocus: false });
  }

  // ============================================
  // REVEAL ANIMATIONS
  // ============================================
  const revealElements = document.querySelectorAll('.reveal, .reveal-stagger');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -80px 0px'
    }
  );

  revealElements.forEach((el) => revealObserver.observe(el));

  // ============================================
  // STATS COUNTER ANIMATION
  // ============================================
  const statElements = document.querySelectorAll('[data-count]');

  const statsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          statsObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  function animateCounter(element) {
    const target = parseInt(element.dataset.count);
    const originalText = element.textContent;
    const prefix = originalText.match(/^[^\d]*/)[0] || '';
    const suffix = originalText.match(/[^\d]*$/)[0] || '';
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      element.textContent = prefix + Math.floor(current) + suffix;
    }, duration / steps);
  }

  statElements.forEach((el) => statsObserver.observe(el));

  // Also animate regular stat-value elements
  const statValues = document.querySelectorAll('.stat-value:not([data-count])');

  const statValueObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateStatValue(entry.target);
          statValueObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  function animateStatValue(element) {
    const text = element.textContent;
    const match = text.match(/^([\$]?)(\d+(?:\.\d+)?)([\w%+B]*)/);
    if (!match) return;

    const prefix = match[1];
    const value = parseFloat(match[2]);
    const suffix = match[3];
    const duration = 2000;
    const steps = 60;
    let current = 0;

    const timer = setInterval(() => {
      current += value / steps;
      if (current >= value) {
        current = value;
        clearInterval(timer);
      }

      let displayValue = Number.isInteger(value) ? Math.floor(current) : current.toFixed(1);
      element.textContent = prefix + displayValue + suffix;
    }, duration / steps);
  }

  statValues.forEach(el => statValueObserver.observe(el));

  // ============================================
  // FAQ ACCORDION
  // ============================================
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const trigger = item.querySelector('.faq-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close all other items
      faqItems.forEach((otherItem) => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
        }
      });

      // Toggle current item
      item.classList.toggle('active');
    });
  });

  // ============================================
  // STICKY CTA BAR
  // ============================================
  const stickyCta = document.getElementById('stickyCta');
  const heroSection = document.querySelector('.hero') || document.querySelector('.page-hero');

  if (stickyCta && heroSection) {
    const stickyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            stickyCta.classList.add('visible');
          } else {
            stickyCta.classList.remove('visible');
          }
        });
      },
      { threshold: 0 }
    );

    stickyObserver.observe(heroSection);
  }

  // ============================================
  // TESTIMONIALS CAROUSEL PAUSE ON HOVER
  // ============================================
  const testimonialTrack = document.querySelector('.testimonials-track');

  if (testimonialTrack) {
    testimonialTrack.addEventListener('mouseenter', () => {
      testimonialTrack.style.animationPlayState = 'paused';
    });

    testimonialTrack.addEventListener('mouseleave', () => {
      testimonialTrack.style.animationPlayState = 'running';
    });
  }

  // ============================================
  // LOGO MARQUEE PAUSE ON HOVER
  // ============================================
  const logoMarquee = document.querySelector('.logo-marquee');

  if (logoMarquee) {
    logoMarquee.addEventListener('mouseenter', () => {
      logoMarquee.style.animationPlayState = 'paused';
    });

    logoMarquee.addEventListener('mouseleave', () => {
      logoMarquee.style.animationPlayState = 'running';
    });
  }

  // ============================================
  // SMOOTH SCROLL FOR ANCHOR LINKS
  // ============================================
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function(e) {
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || this.hasAttribute('download') || this.target && this.target !== '_self') return;
      const href = this.getAttribute('href');
      if (href === '#') return;

      const target = document.getElementById(href.slice(1));
      if (target) {
        e.preventDefault();
        // Keyboard navigation leaves the hidden menu and continues at its destination.
        if (!target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1');
          target.addEventListener('blur', () => {
            if (target.getAttribute('tabindex') === '-1') target.removeAttribute('tabindex');
          }, { once: true });
        }
        target.focus({ preventScroll: true });
        const navbarHeight = navbar ? navbar.offsetHeight : 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navbarHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
      }
    });
  });

  // ============================================
  // FORM HANDLING
  // ============================================
  const forms = document.querySelectorAll('.contact-form');

  forms.forEach((form) => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      // Validate required fields
      let isValid = true;
      form.querySelectorAll('[required]').forEach((field) => {
        if (!field.value.trim()) {
          field.classList.add('error');
          isValid = false;
        } else {
          field.classList.remove('error');
        }
      });

      // Email validation
      const emailField = form.querySelector('[type="email"]');
      if (emailField && emailField.value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailField.value)) {
          emailField.classList.add('error');
          isValid = false;
        }
      }

      if (!isValid) return;

      // Submit (Netlify Forms when data-netlify is set, otherwise native)
      const statusEl = form.querySelector('.form-status');
      const setStatus = (msg, isError) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.classList.toggle('is-error', !!isError);
      };

      if (!form.hasAttribute('data-netlify')) {
        form.submit();
        return;
      }

      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
      setStatus('', false);

      const body = new URLSearchParams(new FormData(form)).toString();
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      })
        .then((res) => {
          if (!res.ok) throw new Error('Form submit failed: ' + res.status);
          submitBtn.textContent = 'Message Sent!';
          submitBtn.classList.add('success');
          if (form.classList.contains('pilot-form')) {
            var fd = new FormData(form);
            var qs = new URLSearchParams({ name: fd.get('name') || '', email: fd.get('email') || '', website: fd.get('website') || '', phone: fd.get('phone') || '' }).toString();
            window.location.href = 'onboard.html?' + qs;
            return;
          }
          window.location.href = form.getAttribute('action') || 'thank-you.html';
        })
        .catch(() => {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
          setStatus('We couldn’t confirm your message was sent. Your answers are still here. Please try again, or email support@machinesandcloud.com for help.', true);
        });
    });

    // Remove error on input
    form.querySelectorAll('input, select, textarea').forEach((field) => {
      field.addEventListener('input', () => {
        field.classList.remove('error');
      });
    });
  });

  // ============================================
  // PARALLAX EFFECT FOR ORBS
  // ============================================
  const orbs = document.querySelectorAll('.orb');

  if (orbs.length > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          orbs.forEach((orb, index) => {
            const speed = 0.05 + (index * 0.02);
            const yOffset = scrollY * speed;
            orb.style.transform = `translateY(${yOffset}px)`;
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ============================================
  // CARD HOVER EFFECTS
  // ============================================
  const cards = document.querySelectorAll('.card');

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 30;
        const rotateY = (centerX - x) / 30;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // ============================================
  // ACTIVE NAV LINK
  // ============================================
  function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navbar-links a').forEach((link) => {
      const href = link.getAttribute('href');
      link.classList.toggle('active', href === currentPage);
    });
  }

  setActiveNavLink();

  // ============================================
  // REDUCED MOTION
  // ============================================
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('reduce-motion');

    // Disable marquee animations
    document.querySelectorAll('.logo-marquee, .testimonials-track').forEach((el) => {
      el.style.animation = 'none';
    });

    // Disable orb animations
    document.querySelectorAll('.orb').forEach((orb) => {
      orb.style.animation = 'none';
    });
  }

  // ============================================
  // LAZY LOADING IMAGES
  // ============================================
  const lazyImages = document.querySelectorAll('img[data-src]');

  if (lazyImages.length > 0) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });

    lazyImages.forEach((img) => imageObserver.observe(img));
  }

  // ============================================
  // TYPING EFFECT FOR HERO (Optional)
  // ============================================
  const typingElement = document.querySelector('.hero-title-typing');

  if (typingElement) {
    const words = ['production.', 'governance.', 'results.'];
    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;

    function typeEffect() {
      const currentWord = words[wordIndex];

      if (isDeleting) {
        typingElement.textContent = currentWord.substring(0, charIndex - 1);
        charIndex--;
      } else {
        typingElement.textContent = currentWord.substring(0, charIndex + 1);
        charIndex++;
      }

      let typeSpeed = isDeleting ? 50 : 100;

      if (!isDeleting && charIndex === currentWord.length) {
        typeSpeed = 2000;
        isDeleting = true;
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        typeSpeed = 500;
      }

      setTimeout(typeEffect, typeSpeed);
    }

    typeEffect();
  }

  // ============================================
  // AGENT TERMINAL ANIMATION
  // ============================================
  const terminalBody = document.querySelector('.terminal-body');

  if (terminalBody) {
    const terminalLines = terminalBody.querySelectorAll('.terminal-line');
    const totalDuration = 12000; // 12 seconds for full animation
    const restartDelay = 3000; // 3 second pause before restart

    function restartTerminalAnimation() {
      // Reset all lines
      terminalLines.forEach((line) => {
        line.style.animation = 'none';
        line.offsetHeight; // Trigger reflow
        line.style.animation = '';
      });
    }

    // Restart animation periodically
    setInterval(() => {
      restartTerminalAnimation();
    }, totalDuration + restartDelay);
  }

  // ============================================
  // DYNAMIC WORKFLOW ANIMATIONS
  // ============================================
  const workflowCards = document.querySelectorAll('.workflow-demo-card');

  if (workflowCards.length > 0) {
    workflowCards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.2}s`;
    });
  }

  // ============================================
  // CONSOLE BRANDING
  // ============================================
  console.log(
    '%c Machines & Cloud ',
    'background: linear-gradient(135deg, #1E40AF, #3B82F6, #60A5FA); color: white; font-size: 20px; padding: 15px 30px; border-radius: 8px; font-weight: bold;'
  );
  console.log('%c Production AI Agents That Actually Ship', 'color: #60A5FA; font-size: 14px;');
  console.log('%c https://machinesandcloud.com', 'color: #718096; font-size: 12px;');

  // ============================================
  // IMMERSIVE AGENTIC AI EXPERIENCE
  // Full-page AI Agent Interface System
  // ============================================

  // Only initialize on larger screens and if motion is allowed
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.innerWidth > 768) {

    // Enable agent mode only when the status bar is present
    const statusBar = document.querySelector('.agent-status-bar');
    if (statusBar) {
      document.body.classList.add('agent-mode');
    }

    // ============================================
    // ENHANCED TERMINAL INTERACTIVITY
    // ============================================
    const terminalBody = document.querySelector('.terminal-body');

    if (terminalBody) {
      // Add interactive input line
      const inputLineHTML = `
        <div class="terminal-input-line">
          <span class="terminal-input-prompt">$</span>
          <input type="text" class="terminal-input" placeholder="Try: process claim, check status, run audit..." id="terminalInput">
          <span class="terminal-cursor"></span>
        </div>
      `;
      terminalBody.insertAdjacentHTML('beforeend', inputLineHTML);

      const terminalInput = document.getElementById('terminalInput');

      const terminalCommands = {
        'process claim': [
          { prompt: '→', text: 'Opening an illustrative claim workflow...', class: 'typing' },
          { prompt: '✓', text: 'Example record shown; no customer data loaded', class: 'success' },
          { prompt: '⚡', text: 'Example: review the supplied policy information', class: '' },
          { prompt: '✓', text: 'Coverage needs verification by an authorized reviewer', class: 'success' },
          { prompt: '✓', text: 'Example ends at human review; no claim approved', class: 'success', badge: 'EXAMPLE' }
        ],
        'check status': [
          { prompt: '→', text: 'Showing an illustrative status display...', class: 'typing' },
          { prompt: '✓', text: 'Example only; not a live service-status report', class: 'success' },
          { prompt: '📊', text: 'No customer tasks have been executed by this demo', class: '' },
          { prompt: '✓', text: 'Use the actual workspace for service status', class: 'success', badge: 'EXAMPLE' }
        ],
        'run audit': [
          { prompt: '→', text: 'Opening an illustrative audit workflow...', class: 'typing' },
          { prompt: '🔍', text: 'Example: identify records that need review', class: '' },
          { prompt: '✓', text: 'No real decisions or customer logs were reviewed', class: 'success' },
          { prompt: '✓', text: 'Compliance conclusions require qualified human review', class: 'success' },
          { prompt: '📋', text: 'Illustration complete; no audit was performed', class: '', badge: 'EXAMPLE' }
        ]
      };

      terminalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const command = terminalInput.value.trim().toLowerCase();
          terminalInput.value = '';

          const commands = terminalCommands[command] || [
            { prompt: '✗', text: `Unknown command: ${command}`, class: 'warning' },
            { prompt: '→', text: 'Try: process claim, check status, run audit', class: '' }
          ];

          // Clear existing demo lines (keep header)
          const existingLines = terminalBody.querySelectorAll('.terminal-line:not(.terminal-input-line)');
          existingLines.forEach(line => line.remove());

          // Add new lines with stagger
          commands.forEach((cmd, index) => {
            setTimeout(() => {
              const badgeHTML = cmd.badge ? `<span class="terminal-badge ${cmd.class}">${cmd.badge}</span>` : '';
              const lineHTML = `
                <div class="terminal-line" style="animation: fadeSlideIn 0.3s ease forwards;">
                  <span class="terminal-prompt">${cmd.prompt}</span>
                  <span class="terminal-text ${cmd.class}">${cmd.text}</span>
                  ${badgeHTML}
                </div>
              `;
              terminalBody.insertAdjacentHTML('afterbegin', lineHTML);
            }, index * 400);
          });
        }
      });
    }

    // ============================================
    // AGENT WORKFLOW CYCLE (on approach page)
    // ============================================
    const archLayers = document.querySelectorAll('.arch-layer');

    if (archLayers.length > 0) {
      let currentLayer = 0;

      function cycleArchLayers() {
        archLayers.forEach((layer, index) => {
          layer.classList.remove('active');
          if (index === currentLayer) {
            layer.classList.add('active');
          }
        });
        currentLayer = (currentLayer + 1) % archLayers.length;
      }

      // Start cycle
      setInterval(cycleArchLayers, 2000);
    }

  } // End reduced motion check

  // ============================================
  // IMMERSIVE SECTION ANIMATIONS
  // Each section reveals with presence
  // ============================================
  const immersiveSections = document.querySelectorAll('.section, .hero');

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('section-active');
          // Stagger reveal children
          const reveals = entry.target.querySelectorAll('.reveal, .card, .stat-card, .process-item');
          reveals.forEach((el, i) => {
            setTimeout(() => el.classList.add('revealed'), i * 100);
          });
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
  );

  immersiveSections.forEach(section => sectionObserver.observe(section));

})();
