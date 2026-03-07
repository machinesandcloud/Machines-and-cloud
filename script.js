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

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function() {
      const isOpen = navMenu.classList.contains('is-open');
      navMenu.classList.toggle('is-open');
      navToggle.classList.toggle('is-active');
      document.body.style.overflow = isOpen ? '' : 'hidden';
    });

    // Close on link click
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('is-open');
        navToggle.classList.remove('is-active');
        document.body.style.overflow = '';
      });
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
        navMenu.classList.remove('is-open');
        navToggle.classList.remove('is-active');
        document.body.style.overflow = '';
      }
    });
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
      const href = this.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const navbarHeight = navbar ? navbar.offsetHeight : 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navbarHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
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

      // Simulate submission
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;

      setTimeout(() => {
        submitBtn.textContent = 'Message Sent!';
        submitBtn.classList.add('success');

        setTimeout(() => {
          form.reset();
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
          submitBtn.classList.remove('success');
        }, 3000);
      }, 1000);
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

    // Enable agent mode on body
    document.body.classList.add('agent-mode');

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
          { prompt: '→', text: 'Initializing claim processor...', class: 'typing' },
          { prompt: '✓', text: 'Claim #CLM-9421 loaded', class: 'success' },
          { prompt: '⚡', text: 'Extracting policy data...', class: '' },
          { prompt: '✓', text: 'Coverage verified: $50,000 limit', class: 'success' },
          { prompt: '✓', text: 'Claim approved for fast-track', class: 'success', badge: 'APPROVED' }
        ],
        'check status': [
          { prompt: '→', text: 'Querying agent status...', class: 'typing' },
          { prompt: '✓', text: 'Agent: ONLINE | Uptime: 99.7%', class: 'success' },
          { prompt: '📊', text: 'Tasks today: 1,247 completed', class: '' },
          { prompt: '✓', text: 'All systems operational', class: 'success', badge: 'HEALTHY' }
        ],
        'run audit': [
          { prompt: '→', text: 'Starting compliance audit...', class: 'typing' },
          { prompt: '🔍', text: 'Scanning decision logs...', class: '' },
          { prompt: '✓', text: '14,392 decisions reviewed', class: 'success' },
          { prompt: '✓', text: 'No compliance violations detected', class: 'success' },
          { prompt: '📋', text: 'Audit report generated', class: '', badge: 'PASS' }
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
  // IMMERSIVE AI COMPANION
  // Full-page experience with contextual intelligence
  // ============================================

  const contextualPrompts = {
    hero: {
      greeting: "Welcome",
      message: "I help businesses ship AI that actually works. What brings you here today?",
      status: "Ready to assist",
      workflow: ["Analyzing", "visitor intent", "..."],
      actions: [
        { label: "Explore what we build", target: "solution", icon: "→" },
        { label: "See real results", target: "stats", icon: "📊" }
      ]
    },
    problem: {
      greeting: "Understanding your challenge",
      message: "70% of AI projects stall. Not because the AI doesn't work — but because they lack governance. Let me show you how we solve this.",
      status: "Analyzing pain points",
      workflow: ["Identifying", "blockers", "..."],
      actions: [
        { label: "Show me the solution", target: "solution", icon: "→" },
        { label: "Skip to proof", target: "testimonials", icon: "✓" }
      ]
    },
    solution: {
      greeting: "Our approach",
      message: "Five layers. Each one matters. This is how production AI actually gets built.",
      status: "Presenting architecture",
      workflow: ["Loading", "system design", "..."],
      actions: [
        { label: "See it in action", target: "process", icon: "⚡" },
        { label: "View examples", target: "testimonials", icon: "📋" }
      ]
    },
    stats: {
      greeting: "Market intelligence",
      message: "These aren't projections — they're results from live deployments.",
      status: "Loading metrics",
      workflow: ["Fetching", "real data", "..."],
      actions: [
        { label: "See case studies", href: "case-studies.html", icon: "📁" },
        { label: "Calculate ROI", target: "roi", icon: "💰" }
      ]
    },
    services: {
      greeting: "Engagement options",
      message: "Most clients start with Proof of Value — a working agent in 4 weeks. Clear scope. Clear outcomes.",
      status: "Displaying packages",
      workflow: ["Rendering", "options", "..."],
      actions: [
        { label: "Learn more", href: "services.html", icon: "→" },
        { label: "See process", target: "process", icon: "📋" }
      ]
    },
    testimonials: {
      greeting: "Social proof",
      message: "Real results. Specific metrics. Every claim is auditable.",
      status: "Fetching testimonials",
      workflow: ["Loading", "case data", "..."],
      actions: [
        { label: "Full case studies", href: "case-studies.html", icon: "📁" },
        { label: "Calculate impact", target: "roi", icon: "💰" }
      ]
    },
    process: {
      greeting: "How we work",
      message: "Structured. Predictable. No surprises. Each phase has clear gates.",
      status: "Explaining methodology",
      workflow: ["Mapping", "workflow", "..."],
      actions: [
        { label: "Which industries?", target: "industries", icon: "🏢" },
        { label: "Let's talk", href: "contact.html", icon: "📞" }
      ]
    },
    industries: {
      greeting: "Target verticals",
      message: "We go deep where the patterns are proven. Finance. Insurance. SaaS. Manufacturing.",
      status: "Analyzing sectors",
      workflow: ["Targeting", "verticals", "..."],
      actions: [
        { label: "Industry details", href: "industries.html", icon: "→" },
        { label: "My savings?", target: "roi", icon: "💰" }
      ]
    },
    roi: {
      greeting: "Value calculator",
      message: "Try the numbers. Most clients see 3-5x ROI in year one.",
      status: "Calculating potential",
      workflow: ["Computing", "savings", "..."],
      actions: [
        { label: "Book discovery call", href: "contact.html", icon: "📞" },
        { label: "See pricing", target: "services", icon: "💳" }
      ]
    },
    faq: {
      greeting: "Common questions",
      message: "If yours isn't here, I'm ready to help.",
      status: "Loading responses",
      workflow: ["Indexing", "FAQ", "..."],
      actions: [
        { label: "Talk to us", href: "contact.html", icon: "📞" },
        { label: "Start over", target: "hero", icon: "↑" }
      ]
    },
    cta: {
      greeting: "Ready?",
      message: "A discovery call takes 30 minutes. No pitch. Just clarity on your next step.",
      status: "Conversion ready",
      workflow: ["Preparing", "call link", "..."],
      actions: [
        { label: "Book a call", href: "contact.html", icon: "📞" },
        { label: "Case studies", href: "case-studies.html", icon: "📁" }
      ]
    }
  };

  // Create immersive companion
  const companion = document.createElement('div');
  companion.className = 'ai-companion';
  companion.innerHTML = `
    <div class="ai-companion-header">
      <div class="ai-companion-avatar">
        <div class="avatar-ring"></div>
        <div class="avatar-core">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
          </svg>
        </div>
      </div>
      <div class="ai-companion-meta">
        <div class="ai-companion-name">M&C Agent</div>
        <div class="ai-companion-status">
          <span class="status-dot"></span>
          <span class="status-text">Ready to assist</span>
        </div>
      </div>
      <button class="ai-companion-minimize" aria-label="Minimize">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </button>
    </div>
    <div class="ai-companion-body">
      <div class="ai-companion-workflow">
        <span class="workflow-step"></span>
        <span class="workflow-step"></span>
        <span class="workflow-step"></span>
      </div>
      <div class="ai-companion-greeting"></div>
      <div class="ai-companion-message"></div>
      <div class="ai-companion-actions"></div>
    </div>
    <div class="ai-companion-collapsed">
      <div class="collapsed-indicator"></div>
      <span>AI Guide</span>
    </div>
  `;
  document.body.appendChild(companion);

  const greetingEl = companion.querySelector('.ai-companion-greeting');
  const messageEl = companion.querySelector('.ai-companion-message');
  const actionsEl = companion.querySelector('.ai-companion-actions');
  const statusEl = companion.querySelector('.status-text');
  const workflowSteps = companion.querySelectorAll('.workflow-step');
  const minimizeBtn = companion.querySelector('.ai-companion-minimize');
  const collapsedEl = companion.querySelector('.ai-companion-collapsed');

  let isMinimized = false;
  let currentSection = null;
  let isTyping = false;

  // Toggle minimize
  minimizeBtn.addEventListener('click', () => {
    isMinimized = true;
    companion.classList.add('minimized');
  });

  collapsedEl.addEventListener('click', () => {
    isMinimized = false;
    companion.classList.remove('minimized');
  });

  // Workflow animation
  function animateWorkflow(steps) {
    workflowSteps.forEach((el, i) => {
      el.textContent = steps[i] || '';
      el.classList.remove('active');
    });
    let step = 0;
    const interval = setInterval(() => {
      workflowSteps.forEach(el => el.classList.remove('active'));
      if (step < workflowSteps.length) {
        workflowSteps[step].classList.add('active');
        step++;
      } else {
        clearInterval(interval);
      }
    }, 300);
  }

  // Typing effect
  function typeMessage(text, callback) {
    if (isTyping) return;
    isTyping = true;
    messageEl.textContent = '';
    messageEl.classList.add('typing');
    let i = 0;
    const speed = 15;

    function type() {
      if (i < text.length) {
        messageEl.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed);
      } else {
        isTyping = false;
        messageEl.classList.remove('typing');
        if (callback) callback();
      }
    }
    type();
  }

  // Update actions
  function updateActions(actions) {
    actionsEl.innerHTML = actions.map(action => {
      if (action.href) {
        return `<a href="${action.href}" class="ai-companion-action"><span class="action-icon">${action.icon}</span>${action.label}</a>`;
      }
      return `<button class="ai-companion-action" data-target="${action.target}"><span class="action-icon">${action.icon}</span>${action.label}</button>`;
    }).join('');

    actionsEl.querySelectorAll('[data-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.querySelector(`[data-agent-section="${btn.dataset.target}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // Update companion
  function updateCompanion(sectionName) {
    if (sectionName === currentSection || isTyping) return;
    currentSection = sectionName;

    const prompt = contextualPrompts[sectionName];
    if (!prompt) return;

    companion.classList.add('transitioning');

    // Update status
    statusEl.textContent = prompt.status;

    // Animate workflow
    animateWorkflow(prompt.workflow);

    setTimeout(() => {
      companion.classList.remove('transitioning');
      greetingEl.textContent = prompt.greeting;
      typeMessage(prompt.message, () => {
        updateActions(prompt.actions);
      });
    }, 600);
  }

  // Observe sections
  const sections = document.querySelectorAll('[data-agent-section]');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
          const sectionName = entry.target.getAttribute('data-agent-section');
          updateCompanion(sectionName);
        }
      });
    },
    { threshold: [0.3, 0.5], rootMargin: '-10% 0px -10% 0px' }
  );

  sections.forEach(section => observer.observe(section));

  // Initialize
  setTimeout(() => updateCompanion('hero'), 800);

  // ============================================
  // STICKY PROGRESS INDICATOR
  // ============================================
  const progressBar = document.createElement('div');
  progressBar.className = 'scroll-progress-bar';
  progressBar.innerHTML = '<div class="scroll-progress-fill"></div>';
  document.body.appendChild(progressBar);

  const progressFill = progressBar.querySelector('.scroll-progress-fill');

  window.addEventListener('scroll', () => {
    const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    progressFill.style.width = `${scrollPercent}%`;
  }, { passive: true });

  // ============================================
  // SECTION VISUALIZATIONS
  // Add mini-terminals to key sections
  // ============================================
  const sectionVisuals = {
    stats: `
      <div class="section-visual stats-visual">
        <div class="visual-line"><span class="v-prompt">▸</span> Loading market data...</div>
        <div class="visual-line success"><span class="v-prompt">✓</span> $588B market indexed</div>
        <div class="visual-line"><span class="v-prompt">▸</span> Calculating growth rate...</div>
        <div class="visual-line success"><span class="v-prompt">✓</span> 44.8% CAGR confirmed</div>
      </div>
    `,
    testimonials: `
      <div class="section-visual testimonials-visual">
        <div class="visual-line"><span class="v-prompt">▸</span> Fetching verified results...</div>
        <div class="visual-line success"><span class="v-prompt">✓</span> 67% faster processing</div>
        <div class="visual-line success"><span class="v-prompt">✓</span> 100% audit compliance</div>
      </div>
    `,
    roi: `
      <div class="section-visual roi-visual">
        <div class="visual-line"><span class="v-prompt">▸</span> Initializing calculator...</div>
        <div class="visual-line"><span class="v-prompt">⚡</span> Input your metrics below</div>
        <div class="visual-line success"><span class="v-prompt">✓</span> Real-time computation ready</div>
      </div>
    `
  };

  // Inject visuals into sections
  Object.entries(sectionVisuals).forEach(([sectionId, html]) => {
    const section = document.querySelector(`[data-agent-section="${sectionId}"]`);
    if (section) {
      const container = section.querySelector('.container');
      if (container) {
        container.insertAdjacentHTML('afterbegin', html);
      }
    }
  });

})();
