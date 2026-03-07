const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

reveals.forEach((el) => observer.observe(el));

const finderData = {
  clarity: {
    title: 'AI Workflow Opportunity Sprint',
    copy:
      'Start with an opportunity sprint to map workflows, quantify ROI, and lock in success metrics before you build.',
    items: [
      'Process inventory + top 3 workflows',
      'KPI baselines + ROI hypothesis',
      'Integration feasibility + risk screen',
    ],
  },
  data: {
    title: 'Data + Knowledge Readiness Kit',
    copy:
      'Prepare data, permissions, and retrieval flows so agents can work safely with your knowledge assets.',
    items: [
      'Corpus map + RAG design',
      'Access controls + permissions mapping',
      'Evaluation dataset + red team plan',
    ],
  },
  proof: {
    title: 'Agentic Proof-of-Value',
    copy:
      'Build a production-ready agent with approvals, evals, and security controls to validate feasibility.',
    items: [
      'End-to-end workflow agent',
      'Evaluation harness + monitoring',
      'Security testing + audit trail',
    ],
  },
  scale: {
    title: 'Production Agent Build',
    copy:
      'Deploy a workflow agent into core systems with observability and an operational handoff.',
    items: [
      'Tool integrations + orchestration',
      'Human-in-loop approvals',
      'Observability + rollback plan',
    ],
  },
};

const optionButtons = document.querySelectorAll('.option');
const finderTitle = document.getElementById('finder-title');
const finderCopy = document.getElementById('finder-copy');
const finderList = document.getElementById('finder-list');

if (optionButtons.length && finderTitle && finderCopy && finderList) {
  optionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.closest('.option-group');
      if (group) {
        group.querySelectorAll('.option').forEach((btn) => btn.classList.remove('is-active'));
      }
      button.classList.add('is-active');

      const value = button.dataset.value;
      if (value && finderData[value]) {
        const data = finderData[value];
        finderTitle.textContent = data.title;
        finderCopy.textContent = data.copy;
        finderList.innerHTML = data.items.map((item) => `<li>${item}</li>`).join('');
      }
    });
  });
}
