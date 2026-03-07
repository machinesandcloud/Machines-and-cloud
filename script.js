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

  // Contextual messages with multiple variations and follow-ups
  const contextualPrompts = {
    hero: {
      greeting: "Welcome",
      messages: [
        "I'm your guide through what we build. Take your time — or let me point you where you need to go.",
        "Looking for AI that ships to production? You're in the right place. I'll help you explore.",
        "We build AI agents that actually work in enterprise. Curious where to start?"
      ],
      followUps: [
        { delay: 8000, message: "Most visitors start by seeing our results. The stats section shows real deployment data." },
        { delay: 15000, message: "Feel free to scroll at your own pace — I'll adjust to what you're reading." }
      ],
      insights: {
        returning: "Welcome back. Ready to pick up where we left off?",
        fastScroller: "I see you like to move fast. The TL;DR: we ship production AI in weeks, not months.",
        slowReader: "Take your time. There's a lot here, and I'll make sure you don't miss the important parts."
      },
      status: "Observing your interests",
      actions: [
        { label: "Show me results", target: "stats", icon: "→" },
        { label: "What do you build?", target: "solution", icon: "?" }
      ]
    },
    problem: {
      greeting: "The challenge",
      messages: [
        "70% of AI projects never reach production. Not because AI is hard — because governance is missing.",
        "You're reading about the problem most companies face. Recognition is the first step.",
        "This is the gap that costs enterprises millions. Good news: it's solvable."
      ],
      followUps: [
        { delay: 6000, message: "The solution is actually simpler than most think. Want to see our approach?" },
        { delay: 12000, message: "Every statistic here is from a real deployment. We've lived this problem and solved it." }
      ],
      insights: {
        lingering: "This resonates, doesn't it? If you've tried deploying AI before, this pain is familiar.",
        fastScroller: "Quick scan works here. The key point: AI fails without structure. We provide the structure."
      },
      status: "Analyzing pain points",
      actions: [
        { label: "Show me the fix", target: "solution", icon: "→" },
        { label: "Skip to proof", target: "testimonials", icon: "✓" }
      ]
    },
    solution: {
      greeting: "The architecture",
      messages: [
        "Five layers. Each one essential. This is production-grade AI — not a demo.",
        "You're looking at what separates POCs from real deployments. Every layer has a purpose.",
        "This architecture has shipped to Fortune 500s. It works because it's complete."
      ],
      followUps: [
        { delay: 7000, message: "Hover over any layer to see what it does. The details matter here." },
        { delay: 14000, message: "Most AI projects miss 2-3 of these layers. That's why they fail in production." }
      ],
      insights: {
        technical: "I notice you're spending time here. Want me to explain any specific layer?",
        quickScan: "The quick version: infrastructure → data → models → governance → interface. All five, or it doesn't ship."
      },
      status: "Explaining architecture",
      actions: [
        { label: "How it works", target: "process", icon: "⚡" },
        { label: "See results", target: "testimonials", icon: "📊" }
      ]
    },
    stats: {
      greeting: "The numbers",
      messages: [
        "Real data from real deployments. Every number here has a client story behind it.",
        "These aren't projections — they're measured outcomes. We track everything.",
        "The market is moving fast. These metrics show where the opportunity is."
      ],
      followUps: [
        { delay: 6000, message: "The $4.1T figure gets attention, but the 87% efficiency gain is what clients actually feel." },
        { delay: 12000, message: "Want to calculate your specific opportunity? The ROI calculator does the math." }
      ],
      insights: {
        analytical: "I see you're studying the numbers. Each one is sourced and verifiable.",
        quickScan: "Key takeaway: AI automation delivers 3-5x ROI when deployed correctly. Most companies aren't there yet."
      },
      status: "Presenting market data",
      actions: [
        { label: "Calculate my ROI", target: "roi", icon: "→" },
        { label: "Case studies", href: "case-studies.html", icon: "📁" }
      ]
    },
    services: {
      greeting: "How we engage",
      messages: [
        "Three paths forward. Most clients start with Proof of Value — a working agent in 4 weeks.",
        "Each package is scoped to deliver specific outcomes. No ambiguity, no scope creep.",
        "Whether you need a quick pilot or enterprise transformation, there's a clear path."
      ],
      followUps: [
        { delay: 7000, message: "Proof of Value is popular because you see results before committing to scale." },
        { delay: 14000, message: "Not sure which fits? The discovery call helps us match the right engagement to your situation." }
      ],
      insights: {
        comparing: "Comparing options? The key difference is timeline and scope — not quality.",
        decisive: "Ready to move? Book a discovery call and we'll match you to the right package."
      },
      status: "Showing engagement options",
      actions: [
        { label: "See full details", href: "services.html", icon: "→" },
        { label: "Our process", target: "process", icon: "📋" }
      ]
    },
    testimonials: {
      greeting: "What clients say",
      messages: [
        "Real testimonials from real projects. Every result here is documented.",
        "These aren't cherry-picked quotes — they're representative outcomes.",
        "The best proof is measurable impact. These clients measured."
      ],
      followUps: [
        { delay: 6000, message: "Each testimonial links to a fuller case study if you want the details." },
        { delay: 12000, message: "Notice the specificity — percentages, timelines, outcomes. We don't do vague." }
      ],
      insights: {
        skeptical: "Healthy skepticism is good. Every claim here is verifiable with documentation.",
        interested: "A testimonial catching your eye? I can point you to the full case study."
      },
      status: "Loading social proof",
      actions: [
        { label: "Full case studies", href: "case-studies.html", icon: "📁" },
        { label: "Calculate my impact", target: "roi", icon: "→" }
      ]
    },
    process: {
      greeting: "Our methodology",
      messages: [
        "Structured. Predictable. No surprises. Each phase has clear gates and deliverables.",
        "You're seeing how we actually work — weekly syncs, clear milestones, transparent progress.",
        "This process has shipped dozens of production systems. It's refined, not invented."
      ],
      followUps: [
        { delay: 7000, message: "The Discovery phase is free. It's where we figure out if there's actually a fit." },
        { delay: 14000, message: "Notice the timeline clarity? You'll always know exactly where we are." }
      ],
      insights: {
        methodical: "I see you appreciate structure. Every deliverable in this process is documented.",
        scanning: "The short version: discovery → build → deploy → optimize. Clear gates at each step."
      },
      status: "Explaining workflow",
      actions: [
        { label: "Which industries?", target: "industries", icon: "→" },
        { label: "Let's talk", href: "contact.html", icon: "📞" }
      ]
    },
    industries: {
      greeting: "Where we specialize",
      messages: [
        "Finance. Insurance. SaaS. Manufacturing. We go deep where patterns are proven.",
        "Each industry has unique AI opportunities. We've mapped them.",
        "Specialization matters. Generic AI advice doesn't ship production systems."
      ],
      followUps: [
        { delay: 6000, message: "Click any industry to see specific use cases and case studies." },
        { delay: 12000, message: "Not seeing your industry? Some patterns transfer. Worth a conversation." }
      ],
      insights: {
        exploring: "Looking for your industry? We've deployed in more verticals than shown here.",
        focused: "Found your sector? Each one has a dedicated page with specific case studies."
      },
      status: "Mapping opportunities",
      actions: [
        { label: "Industry details", href: "industries.html", icon: "→" },
        { label: "Calculate savings", target: "roi", icon: "→" }
      ]
    },
    roi: {
      greeting: "Your potential",
      messages: [
        "Try the calculator. Input your numbers, see your opportunity.",
        "Most clients are surprised by the math. The savings compound faster than expected.",
        "Real ROI calculation, not optimistic projections. Conservative estimates only."
      ],
      followUps: [
        { delay: 8000, message: "Tip: The calculator defaults to conservative estimates. Your actual numbers might be higher." },
        { delay: 15000, message: "Want help with the inputs? Book a call and we'll calculate together with your real data." }
      ],
      insights: {
        calculating: "Playing with the numbers? Most clients see 3-5x first-year ROI.",
        ready: "The math makes sense, doesn't it? Happy to validate these numbers on a call."
      },
      status: "Computing potential",
      actions: [
        { label: "Book discovery call", href: "contact.html", icon: "📞" },
        { label: "See pricing", target: "services", icon: "→" }
      ]
    },
    faq: {
      greeting: "Questions answered",
      messages: [
        "Common questions, direct answers. If yours isn't here, I'm ready to help.",
        "We've collected the questions that matter most. Click any to expand.",
        "Transparency matters. No question is off-limits."
      ],
      followUps: [
        { delay: 8000, message: "Don't see your question? The contact form or a quick call works too." },
        { delay: 15000, message: "The FAQ covers 80% of what people ask. The other 20% is always custom to your situation." }
      ],
      insights: {
        reading: "Good questions being asked here. Most concerns are addressable.",
        scanning: "Looking for something specific? Try Cmd+F or ask me directly."
      },
      status: "Indexing answers",
      actions: [
        { label: "Talk to a human", href: "contact.html", icon: "📞" },
        { label: "Back to top", target: "hero", icon: "↑" }
      ]
    },
    cta: {
      greeting: "Next step",
      messages: [
        "A discovery call is 30 minutes. No pitch, just clarity on whether we can help.",
        "You've seen what we do. Ready to see if it fits your situation?",
        "The next step is a conversation. No commitment, just exploration."
      ],
      followUps: [
        { delay: 5000, message: "The discovery call is free. Worst case, you leave with clarity on your AI strategy." },
        { delay: 10000, message: "Still thinking? I can point you to more case studies or specific details." }
      ],
      insights: {
        ready: "You've explored thoroughly. A call is the natural next step.",
        hesitant: "Not ready to talk? Case studies and industry pages have more detail if you need it."
      },
      status: "Ready when you are",
      actions: [
        { label: "Book a call", href: "contact.html", icon: "📞" },
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
