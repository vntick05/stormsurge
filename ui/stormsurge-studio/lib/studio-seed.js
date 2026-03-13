const sections = [
  {
    id: "operations",
    label: "Operations & Sustainment",
    shortLabel: "O&S",
    prompt: "Shape the operational support story before writing prose.",
    description:
      "This lane is for mission continuity, field support, sustainment, and service delivery requirements.",
  },
  {
    id: "development",
    label: "Development",
    shortLabel: "DEV",
    prompt: "Separate build-time commitments from operational obligations.",
    description:
      "Use this lane for enhancement, engineering, integration, and release execution work.",
  },
  {
    id: "security",
    label: "Cybersecurity",
    shortLabel: "CYBER",
    prompt: "Keep compliance and hardening visible as their own body of work.",
    description:
      "This lane is for RMF, vulnerability management, access control, and security operations requirements.",
  },
  {
    id: "management",
    label: "Program Management",
    shortLabel: "PM",
    prompt: "Track governance, reporting, staffing, and execution controls.",
    description:
      "This lane will hold schedules, reporting cadence, transition, and management deliverables.",
  },
];

const requirements = [
  {
    id: "req-ops-1",
    sectionId: "operations",
    parentId: null,
    position: 1,
    sourceType: "extracted",
    sourceRef: "PWS 3.2.1",
    kind: "top-level",
    title: "Maintain operational availability across fielded systems",
    summary:
      "Mission support requirement positioned as a top-level operational obligation.",
    text: "The contractor shall sustain fielded systems to meet operational availability and mission support expectations across supported environments.",
    intent: "Service continuity",
  },
  {
    id: "req-ops-2",
    sectionId: "operations",
    parentId: "req-ops-1",
    position: 1,
    sourceType: "manual",
    sourceRef: "Workspace draft",
    kind: "child",
    title: "Staff surge support for critical outage windows",
    summary:
      "User-created requirement object nested under the sustainment strategy.",
    text: "Add staffing and escalation language for high-priority outage events, including after-hours response coverage.",
    intent: "Operational resilience",
  },
  {
    id: "req-dev-1",
    sectionId: "development",
    parentId: null,
    position: 1,
    sourceType: "extracted",
    sourceRef: "PWS 4.1",
    kind: "top-level",
    title: "Deliver iterative software enhancements",
    summary:
      "Separate development commitments so solution shaping is not mixed into O&S.",
    text: "The contractor shall design, develop, test, and release approved enhancements to supported platforms in accordance with program priorities.",
    intent: "Engineering delivery",
  },
  {
    id: "req-mgmt-1",
    sectionId: "management",
    parentId: null,
    position: 1,
    sourceType: "extracted",
    sourceRef: "PWS 5.4",
    kind: "top-level",
    title: "Produce monthly status and risk reporting",
    summary:
      "Governance requirement grouped in its own management lane.",
    text: "The contractor shall provide recurring program status, risk, and mitigation reporting to the Government.",
    intent: "Governance",
  },
  {
    id: "req-unassigned-1",
    sectionId: "unassigned",
    parentId: null,
    position: 1,
    sourceType: "extracted",
    sourceRef: "PWS 6.2",
    kind: "candidate",
    title: "Maintain security controls and vulnerability response",
    summary:
      "Candidate cyber requirement held outside the active section until triaged.",
    text: "The contractor shall maintain security controls, remediate vulnerabilities, and support security compliance activities.",
    intent: "Security compliance",
  },
  {
    id: "req-unassigned-2",
    sectionId: "unassigned",
    parentId: null,
    position: 2,
    sourceType: "extracted",
    sourceRef: "PWS 7.1",
    kind: "candidate",
    title: "Stand up a transition-in and knowledge transfer plan",
    summary:
      "Candidate onboarding requirement waiting for section placement.",
    text: "The contractor shall execute transition-in, knowledge transfer, and service assumption activities during task order start-up.",
    intent: "Transition",
  },
];

export function buildInitialState() {
  return {
    sections,
    requirements,
  };
}
