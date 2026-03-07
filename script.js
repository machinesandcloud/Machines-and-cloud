/**
 * Machines & Cloud - Main JavaScript
 * Handles navigation, animations, and interactions
 */

(function() {
  'use strict';

  // ============================================
  // Navbar Scroll Behavior
  // ============================================
  const navbar = document.getElementById('navbar');
  let lastScrollY = window.scrollY;
  let ticking = false;

  function updateNavbar() {
    const scrollY = window.scrollY;

    // Add scrolled class when past threshold
    if (scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // Hide/show on scroll direction (optional - uncomment to enable)
    // if (scrollY > lastScrollY && scrollY > 100) {
    //   navbar.classList.add('hidden');
    // } else {
    //   navbar.classList.remove('hidden');
    // }

    lastScrollY = scrollY;
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateNavbar);
      ticking = true;
    }
  }

  if (navbar) {
    window.addEventListener('scroll', onScroll, { passive: true });
    // Initial check
    updateNavbar();
  }

  // ============================================
  // Mobile Navigation Toggle
  // ============================================
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function() {
      const isOpen = navMenu.classList.contains('is-open');

      navMenu.classList.toggle('is-open');
      navToggle.classList.toggle('is-active');

      // Prevent body scroll when menu is open
      document.body.style.overflow = isOpen ? '' : 'hidden';

      // Update aria attributes
      navToggle.setAttribute('aria-expanded', !isOpen);
    });

    // Close menu when clicking a link
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', function() {
        navMenu.classList.remove('is-open');
        navToggle.classList.remove('is-active');
        document.body.style.overflow = '';
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
        navMenu.classList.remove('is-open');
        navToggle.classList.remove('is-active');
        document.body.style.overflow = '';
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ============================================
  // Scroll Reveal Animations
  // ============================================
  const reveals = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          // Optionally stop observing after reveal
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }
  );

  reveals.forEach((el) => revealObserver.observe(el));

  // ============================================
  // Staggered Animation for Grid Items
  // ============================================
  const staggerContainers = document.querySelectorAll('.grid.reveal');

  staggerContainers.forEach(container => {
    const children = container.children;
    Array.from(children).forEach((child, index) => {
      child.style.transitionDelay = `${index * 0.1}s`;
    });
  });

  // ============================================
  // Smooth Scroll for Anchor Links
  // ============================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');

      // Skip if it's just "#"
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
  // Form Handling
  // ============================================
  const contactForm = document.querySelector('.contact-form');

  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();

      // Get form data
      const formData = new FormData(this);
      const data = Object.fromEntries(formData.entries());

      // Basic validation
      const requiredFields = ['name', 'email', 'company', 'role', 'interest'];
      let isValid = true;

      requiredFields.forEach(field => {
        const input = this.querySelector(`[name="${field}"]`);
        if (input && !input.value.trim()) {
          input.classList.add('error');
          isValid = false;
        } else if (input) {
          input.classList.remove('error');
        }
      });

      if (!isValid) {
        return;
      }

      // Email validation
      const emailInput = this.querySelector('[name="email"]');
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailInput && !emailRegex.test(emailInput.value)) {
        emailInput.classList.add('error');
        return;
      }

      // Show success message (replace with actual form submission)
      const submitBtn = this.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;

      // Simulate submission (replace with actual API call)
      setTimeout(() => {
        submitBtn.textContent = 'Message Sent!';
        submitBtn.classList.add('success');

        // Reset form
        setTimeout(() => {
          this.reset();
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
          submitBtn.classList.remove('success');
        }, 3000);
      }, 1000);
    });

    // Remove error class on input
    contactForm.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('input', function() {
        this.classList.remove('error');
      });
    });
  }

  // ============================================
  // Stats Counter Animation
  // ============================================
  const statValues = document.querySelectorAll('.stat-value');

  const statsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateValue(entry.target);
          statsObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  function animateValue(element) {
    const text = element.textContent;
    const match = text.match(/^([\$]?)(\d+(?:\.\d+)?)([\w%+]*)/);

    if (!match) return;

    const prefix = match[1];
    const value = parseFloat(match[2]);
    const suffix = match[3];
    const duration = 2000;
    const steps = 60;
    const stepDuration = duration / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += value / steps;
      if (current >= value) {
        current = value;
        clearInterval(timer);
      }

      // Format the number
      let displayValue;
      if (Number.isInteger(value)) {
        displayValue = Math.floor(current);
      } else {
        displayValue = current.toFixed(1);
      }

      element.textContent = prefix + displayValue + suffix;
    }, stepDuration);
  }

  statValues.forEach(el => statsObserver.observe(el));

  // ============================================
  // Active Navigation Link
  // ============================================
  function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.navbar-links a');

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  setActiveNavLink();

  // ============================================
  // Lazy Loading Images
  // ============================================
  const lazyImages = document.querySelectorAll('img[data-src]');

  const imageObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    },
    { rootMargin: '50px' }
  );

  lazyImages.forEach(img => imageObserver.observe(img));

  // ============================================
  // Parallax Effect for Hero (subtle)
  // ============================================
  const heroSection = document.querySelector('.hero, .page-hero');

  if (heroSection) {
    window.addEventListener('scroll', function() {
      if (window.scrollY < window.innerHeight) {
        const offset = window.scrollY * 0.3;
        heroSection.style.transform = `translateY(${offset}px)`;
      }
    }, { passive: true });
  }

  // ============================================
  // Copyright Year
  // ============================================
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // ============================================
  // Accessibility: Reduce Motion
  // ============================================
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (prefersReducedMotion.matches) {
    // Disable animations for users who prefer reduced motion
    document.documentElement.style.setProperty('--transition-fast', '0ms');
    document.documentElement.style.setProperty('--transition-normal', '0ms');
    document.documentElement.style.setProperty('--transition-slow', '0ms');

    // Add class for CSS fallbacks
    document.body.classList.add('reduce-motion');
  }

  // ============================================
  // Console Greeting
  // ============================================
  console.log(
    '%c Machines & Cloud ',
    'background: linear-gradient(135deg, #0A1628, #1E3A5F); color: #60A5FA; font-size: 16px; padding: 10px 20px; border-radius: 4px;'
  );
  console.log('Agentic automation engineering for serious operators.');
  console.log('https://machinesandcloud.com');

})();
