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
  // TRULY ALIVE AI COMPANION
  // Behavioral awareness + contextual intelligence
  // ============================================

  // User behavior tracking
  const userBehavior = {
    sessionStart: Date.now(),
    scrollSpeed: 'normal',
    sectionsVisited: new Set(),
    timePerSection: {},
    lastScrollTime: Date.now(),
    scrollDirection: 'down',
    readingDepth: 0,
    engagementLevel: 'exploring',
    hasInteracted: false,
    pauseCount: 0,
    quickScanMode: false
  };

  // Track scroll behavior
  let lastScrollY = window.scrollY;
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    const currentY = window.scrollY;
    const scrollDelta = Math.abs(currentY - lastScrollY);
    const timeDelta = Date.now() - userBehavior.lastScrollTime;

    userBehavior.scrollDirection = currentY > lastScrollY ? 'down' : 'up';
    userBehavior.scrollSpeed = scrollDelta / Math.max(timeDelta, 1) > 2 ? 'fast' : 'normal';
    userBehavior.quickScanMode = userBehavior.scrollSpeed === 'fast';
    userBehavior.readingDepth = Math.max(userBehavior.readingDepth, currentY / document.body.scrollHeight);

    lastScrollY = currentY;
    userBehavior.lastScrollTime = Date.now();

    // Detect pauses (user stopped to read)
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      userBehavior.pauseCount++;
    }, 1500);
  }, { passive: true });

  // Trusted Advisor - Strategic insights and real expertise
  const contextualPrompts = {
    hero: {
      greeting: "Welcome",
      messages: [
        "If you're scanning for fit, focus on how workflows connect to real systems and approvals.",
        "The jump from pilot to production usually hinges on governance, audit trails, and human review.",
        "A good starting point is a single high-volume workflow with clear owners and measurable outcomes."
      ],
      followUps: [
        { delay: 8000, message: "If this feels like a lot, that's normal. We can walk one workflow end-to-end and make it concrete." },
        { delay: 15000, message: "It's okay to start narrow. Depth on one workflow builds confidence for the next." }
      ],
      insights: {
        returning: "Welcome back. Want to continue with industries or jump to the workflow library?",
        fastScroller: "Quick overview: scoped workflow, clear controls, measured targets.",
        slowReader: "You're reading carefully. This page is meant to make the production path feel understandable."
      },
      status: "Overview",
      actions: [
        { label: "See ROI data", target: "stats", icon: "📊" },
        { label: "How it works", target: "solution", icon: "⚡" }
      ]
    },
    problem: {
      greeting: "Common blockers",
      messages: [
        "Most friction comes from integration, approvals, and clarity on ownership — not the model itself.",
        "It's common to feel stuck between a pilot and production. That gap is mostly governance and operational readiness.",
        "Security and risk teams need evidence, not promises. This section highlights the typical blockers."
      ],
      followUps: [
        { delay: 6000, message: "If a workflow feels risky, that's a signal to add approval gates and audit coverage." },
        { delay: 12000, message: "Clear KPIs upfront reduce anxiety later. It creates a shared definition of success." }
      ],
      insights: {
        lingering: "If this feels familiar, you're not alone. The good news is there are reliable ways to address it.",
        fastScroller: "Summary: production readiness is governance + ownership + evidence."
      },
      status: "Context",
      actions: [
        { label: "See the solution", target: "solution", icon: "→" },
        { label: "Proof artifacts", target: "testimonials", icon: "✓" }
      ]
    },
    solution: {
      greeting: "Architecture walkthrough",
      messages: [
        "The orchestration layer is the safety net: retries, state, and controlled fallbacks.",
        "The controls layer is where trust is built — approvals, audit logs, and policy checks.",
        "Knowledge retrieval is only useful when citations and freshness are visible."
      ],
      followUps: [
        { delay: 7000, message: "If integrations feel intimidating, that's normal. The tools layer is where most of the real work lives." },
        { delay: 14000, message: "Evaluation harnesses keep you honest. They make performance measurable, not subjective." }
      ],
      insights: {
        technical: "Want to go deeper? The controls layer is usually where security teams focus.",
        quickScan: "Summary: logged actions, explicit approvals, explainable decisions."
      },
      status: "Technical overview",
      actions: [
        { label: "See our process", target: "process", icon: "📋" },
        { label: "Industry patterns", target: "industries", icon: "🏢" }
      ]
    },
    stats: {
      greeting: "Metrics context",
      messages: [
        "This section frames the PoV target metrics we use to define acceptance gates.",
        "We anchor on one workflow and one KPI so the value is measurable from week one.",
        "Targets are set against your current baseline and validated with a reproducible test set.",
        "Audit coverage, approval gates, and evaluation results are treated as first-class deliverables.",
        "If the targets don’t hold under real data access, we pause and re-scope before production."
      ],
      followUps: [
        { delay: 6000, message: "Helpful framing: KPI target + evidence artifact + owner = production readiness." },
        { delay: 12000, message: "We document what is measured, how it is measured, and who signs off." },
        { delay: 18000, message: "Cost envelopes matter. We track usage and set caps during the PoV." }
      ],
      insights: {
        analytical: "Focus on time-to-production, audit coverage, and KPI lift with documented baselines.",
        quickScan: "Summary: scoped PoV, measurable targets, and evidence artifacts."
      },
      status: "Metrics",
      actions: [
        { label: "Calculate your ROI", target: "roi", icon: "💰" },
        { label: "Case studies", href: "case-studies.html", icon: "📁" }
      ]
    },
    services: {
      greeting: "Engagement overview",
      messages: [
        "Start with an Opportunity Sprint to validate scope, data access, and KPI ownership.",
        "Proof of Value delivers a working workflow with approvals, audit trails, and evaluation harnesses.",
        "Production Launch is gated: security review, rollback plan, and acceptance criteria sign-off.",
        "Operate & Expand focuses on drift detection, regression testing, and incremental workflow rollout.",
        "Each phase has explicit entry and exit gates so risk stays controlled."
      ],
      followUps: [
        { delay: 7000, message: "If you already have a workflow in mind, it helps to note the owner and current KPI." },
        { delay: 14000, message: "Keeping scope narrow is a kindness to your team — it makes success visible." },
        { delay: 20000, message: "Governance artifacts arrive with the workflow, so security can review early." }
      ],
      insights: {
        comparing: "PoV is the sweet spot for most teams: enough evidence to proceed, limited risk.",
        decisive: "Bring one workflow and one KPI. We’ll map it to gates and deliverables."
      },
      status: "Engagement planning",
      actions: [
        { label: "Full service details", href: "services.html", icon: "→" },
        { label: "Book discovery call", href: "contact.html", icon: "📞" }
      ]
    },
    testimonials: {
      greeting: "Evidence review",
      messages: [
        "This section highlights the artifacts you can review before production.",
        "We provide audit trail artifacts, approval gate maps, and evaluation harness outputs.",
        "Risk controls are mapped to OWASP LLM Top 10 and NIST AI RMF.",
        "Every workflow includes an acceptance checklist tied to KPIs.",
        "If you're curious, you can request the evidence pack for deeper review."
      ],
      followUps: [
        { delay: 6000, message: "Baseline measurement happens before build; targets are documented and owned." },
        { delay: 12000, message: "Artifacts include data access maps, cost envelopes, and rollback steps." },
        { delay: 18000, message: "If a risk control isn’t in place, it’s called out explicitly." }
      ],
      insights: {
        skeptical: "Skepticism is healthy. Evidence beats claims.",
        interested: "If your workflow is similar, we can adapt the blueprint quickly."
      },
      status: "Evidence",
      actions: [
        { label: "Workflow library", href: "case-studies.html", icon: "📁" },
        { label: "Calculate your impact", target: "roi", icon: "💰" }
      ]
    },
    process: {
      greeting: "Process map",
      messages: [
        "Stage gates prevent the cool pilot trap. Each phase has explicit acceptance criteria.",
        "The Opportunity Sprint includes risk assessment: data access, security constraints, integration complexity.",
        "We document rollback plans before launch. Production AI needs operational rigor.",
        "PoV success is defined before build, not after.",
        "Operate & Expand is where drift detection and regression testing live."
      ],
      followUps: [
        { delay: 7000, message: "We don’t move forward without signed acceptance criteria." },
        { delay: 14000, message: "Ownership is explicit: who approves, who monitors, who maintains." },
        { delay: 20000, message: "Every gate produces a tangible artifact you can review." }
      ],
      insights: {
        methodical: "The gate system keeps the work calm and predictable. It prevents the confusion that follows a successful pilot with no handoff plan.",
        scanning: "Quick version: Qualify → Sprint (define KPIs) → PoV (prove value) → Launch (production) → Operate (optimize). Clear gates."
      },
      status: "Process",
      actions: [
        { label: "Industry applications", target: "industries", icon: "🏢" },
        { label: "Schedule a call", href: "contact.html", icon: "📞" }
      ]
    },
    industries: {
      greeting: "Industry mapping",
      messages: [
        "We focus on workflows with high volume, clear KPIs, and strong audit needs.",
        "Financial services often prioritize KYC/AML research and compliance lookup.",
        "Insurance teams look for claims intake triage and document extraction.",
        "SaaS/IT teams target helpdesk automation and ticket routing.",
        "Retail and B2B focus on service queues, exceptions, and document routing."
      ],
      followUps: [
        { delay: 6000, message: "Choose one workflow where approval boundaries are obvious and data access is clean." },
        { delay: 12000, message: "We can translate a workflow from one industry to another if the structure is similar." }
      ],
      insights: {
        exploring: "If your industry isn't listed, the patterns often transfer. Document processing, triage, and research workflows exist everywhere.",
        focused: "Click into any industry page for specific use cases, architecture patterns, and workflow details."
      },
      status: "Industry map",
      actions: [
        { label: "Industry deep-dives", href: "industries.html", icon: "→" },
        { label: "Calculate ROI", target: "roi", icon: "💰" }
      ]
    },
    roi: {
      greeting: "Value framing",
      messages: [
        "We model ROI as a hypothesis tied to baseline metrics and target improvements.",
        "Primary drivers: volume, time per case, error rate, and approval latency.",
        "Cost envelopes and token usage are tracked from day one.",
        "You’ll get a model with assumptions called out explicitly.",
        "The goal is clarity, not promises."
      ],
      followUps: [
        { delay: 8000, message: "Use fully-loaded cost, not just salary. It keeps the model honest." },
        { delay: 15000, message: "Higher volume workflows usually show impact faster." },
        { delay: 21000, message: "We can stress-test the model with conservative assumptions." }
      ],
      insights: {
        calculating: "A 30-minute process done 100x/day = 50 hours/week. Small gains compound quickly.",
        ready: "Want a custom model? Book a discovery call and we’ll use your real numbers."
      },
      status: "Value analysis",
      actions: [
        { label: "Book discovery call", href: "contact.html", icon: "📞" },
        { label: "See pricing", href: "services.html", icon: "→" }
      ]
    },
    faq: {
      greeting: "Common questions",
      messages: [
        "Timeline: Sprint 7–10 days, PoV 4–6 weeks, Launch 8–12 weeks.",
        "Security: OWASP LLM Top 10 checklist, NIST AI RMF mapping, and full audit trails.",
        "Integrations: We support common enterprise systems and document permissions upfront.",
        "Governance: Approval gates, rollback plans, and ownership are defined before launch."
      ],
      followUps: [
        { delay: 8000, message: "Most common: 'What if the AI makes mistakes?' Answer: human gates + confidence thresholds." },
        { delay: 15000, message: "Second: 'What about hallucinations?' Answer: citations + evaluations + tool constraints." },
        { delay: 21000, message: "We can align documentation to your procurement and security questionnaires." }
      ],
      insights: {
        reading: "If your question isn't here, we’ll cover it in discovery.",
        scanning: "Quick answers: cloud-agnostic, no lock-in, you own the code."
      },
      status: "Q&A",
      actions: [
        { label: "Talk to a human", href: "contact.html", icon: "📞" },
        { label: "Back to top", target: "hero", icon: "↑" }
      ]
    },
    cta: {
      greeting: "Next steps",
      messages: [
        "Discovery calls are 30 minutes, no pitch. We assess fit and scope one workflow.",
        "We cover: target workflow, KPIs, data access, approval boundaries, and timeline.",
        "You’ll leave with a clear PoV scope and an evidence plan.",
        "If we’re not the right fit, we’ll say so quickly."
      ],
      followUps: [
        { delay: 5000, message: "Preparation tip: Come with a specific workflow in mind. 'Automate everything' is too broad; 'automate claims intake' is actionable." },
        { delay: 10000, message: "We typically book 2-3 weeks out. If you have an urgent timeline, mention it in the booking notes." },
        { delay: 16000, message: "If you already have baseline metrics, bring them to speed up scoping." }
      ],
      insights: {
        ready: "Based on your exploration, you're well-informed. A conversation is the logical next step to see if there's fit.",
        hesitant: "Not ready for a call? The workflow library and industry pages have more detail to help you evaluate."
      },
      status: "Next steps",
      actions: [
        { label: "Book discovery call", href: "contact.html", icon: "📞" },
        { label: "More case studies", href: "case-studies.html", icon: "📁" }
      ]
    }
  };

  // Create companion element
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
        <div class="ai-companion-name">M&C Guide</div>
        <div class="ai-companion-status">
          <span class="status-dot"></span>
          <span class="status-text">Observing</span>
        </div>
      </div>
      <button class="ai-companion-minimize" aria-label="Minimize">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </button>
    </div>
    <div class="ai-companion-body">
      <div class="ai-companion-thinking">
        <span></span><span></span><span></span>
      </div>
      <div class="ai-companion-greeting"></div>
      <div class="ai-companion-message"></div>
      <div class="ai-companion-insight"></div>
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
  const insightEl = companion.querySelector('.ai-companion-insight');
  const actionsEl = companion.querySelector('.ai-companion-actions');
  const statusEl = companion.querySelector('.status-text');
  const thinkingEl = companion.querySelector('.ai-companion-thinking');
  const minimizeBtn = companion.querySelector('.ai-companion-minimize');
  const collapsedEl = companion.querySelector('.ai-companion-collapsed');

  let isMinimized = false;
  let currentSection = null;
  let isTyping = false;
  let followUpTimers = [];
  let sectionEnterTime = Date.now();

  // Minimize handlers
  minimizeBtn.addEventListener('click', () => {
    isMinimized = true;
    companion.classList.add('minimized');
    userBehavior.hasInteracted = true;
  });

  collapsedEl.addEventListener('click', () => {
    isMinimized = false;
    companion.classList.remove('minimized');
    userBehavior.hasInteracted = true;
  });

  // Show thinking animation
  function showThinking(duration = 800) {
    companion.classList.add('thinking');
    thinkingEl.style.display = 'flex';
    return new Promise(resolve => {
      setTimeout(() => {
        companion.classList.remove('thinking');
        thinkingEl.style.display = 'none';
        resolve();
      }, duration);
    });
  }

  // Typing effect with natural variation
  function typeMessage(text, element, callback) {
    if (isTyping) return;
    isTyping = true;
    element.textContent = '';
    element.style.opacity = '1';
    let i = 0;
    const baseSpeed = 18;

    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        // Natural typing variation - pause at punctuation
        const char = text.charAt(i - 1);
        let delay = baseSpeed + Math.random() * 10;
        if ('.!?'.includes(char)) delay += 150;
        else if (',;:'.includes(char)) delay += 80;
        else if (char === '—') delay += 100;
        setTimeout(type, delay);
      } else {
        isTyping = false;
        if (callback) callback();
      }
    }
    type();
  }

  // Get behavior-aware insight
  function getBehaviorInsight(prompt) {
    const insights = prompt.insights || {};
    const timeInSection = Date.now() - sectionEnterTime;

    if (userBehavior.quickScanMode && insights.quickScan) return insights.quickScan;
    if (userBehavior.quickScanMode && insights.fastScroller) return insights.fastScroller;
    if (timeInSection > 12000 && insights.lingering) return insights.lingering;
    if (timeInSection > 8000 && insights.reading) return insights.reading;
    if (userBehavior.pauseCount > 3 && insights.methodical) return insights.methodical;
    if (insights.exploring) return insights.exploring;

    return null;
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
        userBehavior.hasInteracted = true;
        const target = document.querySelector(`[data-agent-section="${btn.dataset.target}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    actionsEl.style.opacity = '0';
    actionsEl.style.transform = 'translateY(10px)';
    setTimeout(() => {
      actionsEl.style.opacity = '1';
      actionsEl.style.transform = 'translateY(0)';
    }, 100);
  }

  // Show follow-up insight
  function showInsight(text) {
    if (isMinimized) return;
    insightEl.textContent = '';
    insightEl.style.opacity = '0';
    insightEl.style.display = 'block';

    setTimeout(() => {
      insightEl.style.opacity = '1';
      typeMessage(text, insightEl);
    }, 200);
  }

  // Schedule follow-up messages
  function scheduleFollowUps(followUps) {
    followUpTimers.forEach(t => clearTimeout(t));
    followUpTimers = [];

    if (!followUps || isMinimized) return;

    followUps.forEach((followUp, index) => {
      const timer = setTimeout(() => {
        if (!isMinimized && !isTyping && currentSection) {
          showInsight(followUp.message);
        }
      }, followUp.delay + (index * 2000));
      followUpTimers.push(timer);
    });
  }

  // Main update function
  async function updateCompanion(sectionName) {
    if (sectionName === currentSection || isTyping) return;

    // Clear previous follow-ups
    followUpTimers.forEach(t => clearTimeout(t));
    followUpTimers = [];

    // Track behavior
    if (currentSection) {
      userBehavior.timePerSection[currentSection] = Date.now() - sectionEnterTime;
    }
    userBehavior.sectionsVisited.add(sectionName);
    sectionEnterTime = Date.now();
    currentSection = sectionName;

    const prompt = contextualPrompts[sectionName];
    if (!prompt) return;

    // Show thinking
    await showThinking(600 + Math.random() * 400);

    // Update status
    statusEl.textContent = prompt.status;

    // Clear insight
    insightEl.style.display = 'none';
    insightEl.textContent = '';

    // Select message based on visit count
    const visitCount = Array.from(userBehavior.sectionsVisited).length;
    const messageIndex = Math.min(Math.floor(Math.random() * prompt.messages.length), prompt.messages.length - 1);
    const message = prompt.messages[messageIndex];

    // Show greeting
    greetingEl.textContent = prompt.greeting;
    greetingEl.style.opacity = '0';
    setTimeout(() => greetingEl.style.opacity = '1', 100);

    // Type message
    messageEl.textContent = '';
    setTimeout(() => {
      typeMessage(message, messageEl, () => {
        updateActions(prompt.actions);

        // Schedule behavior-aware insight or follow-ups
        const behaviorInsight = getBehaviorInsight(prompt);
        if (behaviorInsight) {
          setTimeout(() => showInsight(behaviorInsight), 4000);
        } else {
          scheduleFollowUps(prompt.followUps);
        }
      });
    }, 200);
  }

  // Section observer
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

  // Initialize with welcome
  setTimeout(() => updateCompanion('hero'), 1200);

  // Session-aware proactive engagement
  let sessionCheckInterval;
  let lastProactiveTime = Date.now();

  // Proactive session messages
  const sessionMessages = [
    { time: 60000, message: "You've been exploring for a minute. Found what you're looking for? Let me know if I can help navigate." },
    { time: 180000, message: "Three minutes in — you're clearly interested. The case studies page has the deepest details if you want to go further." },
    { time: 300000, message: "Still here? That's a good sign. Ready to have a conversation? The discovery call is where things get real." }
  ];

  // Check session engagement periodically
  sessionCheckInterval = setInterval(() => {
    if (isMinimized || isTyping) return;

    const sessionTime = Date.now() - userBehavior.sessionStart;
    const timeSinceProactive = Date.now() - lastProactiveTime;

    // Only show proactive message if user hasn't scrolled recently
    if (timeSinceProactive < 45000) return;

    // Find appropriate session message
    const eligibleMessage = sessionMessages.find(m =>
      sessionTime > m.time && sessionTime < m.time + 60000
    );

    if (eligibleMessage && !userBehavior.hasInteracted) {
      showInsight(eligibleMessage.message);
      lastProactiveTime = Date.now();
    }

    // Engagement scoring
    const sectionsExplored = userBehavior.sectionsVisited.size;
    if (sectionsExplored >= 5) {
      userBehavior.engagementLevel = 'engaged';
    } else if (sectionsExplored >= 3) {
      userBehavior.engagementLevel = 'interested';
    }

  }, 30000);

  // Scroll-back detection - welcome back to sections
  let previousSection = null;
  const scrollBackObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && userBehavior.scrollDirection === 'up') {
          const sectionName = entry.target.getAttribute('data-agent-section');
          if (userBehavior.sectionsVisited.has(sectionName) && sectionName !== currentSection) {
            // User is scrolling back to a section they've seen
            const timeSpent = userBehavior.timePerSection[sectionName];
            if (timeSpent && timeSpent > 5000) {
              // They spent time here before, acknowledge it
              setTimeout(() => {
                if (!isTyping && !isMinimized) {
                  showInsight("Coming back to this section? Take another look — sometimes the details click on the second pass.");
                }
              }, 2000);
            }
          }
        }
      });
    },
    { threshold: 0.5 }
  );

  sections.forEach(section => scrollBackObserver.observe(section));

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
