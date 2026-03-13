export const navigationItems = [
  { label: "Workspace", count: null, active: true },
  { label: "Hierarchy Review", count: 26, active: false },
  { label: "Review Queue", count: 7, active: false },
  { label: "Related Context", count: 19, active: false },
  { label: "Audit Log", count: null, active: false },
];

export const summaryCards = [
  { label: "Sections", value: "26" },
  { label: "Paragraphs", value: "86" },
  { label: "Resolved cites", value: "19" },
  { label: "Queue", value: "7" },
];

export const uploads = [
  { name: "STRATA_TO1_PWS.docx", role: "Primary PWS", state: "Parsed", detail: "26 sections, 86 paragraphs" },
  { name: "Strata Base IDIQ PWS.docx", role: "Governing source", state: "Linked", detail: "Strict section citation matching" },
  { name: "Appendix A Map Stack.docx", role: "Capability source", state: "Linked", detail: "Appendix A excerpts scoped to cited lines" },
  { name: "Appendix C 3D Globe.docx", role: "Capability source", state: "Linked", detail: "Service landing page evidence attached" },
];

export const tree = [
  {
    id: "3",
    label: "3 Performance Objectives",
    type: "section",
    children: [
      {
        id: "3.1",
        label: "3.1 Operation and Sustainment",
        type: "section",
        expanded: true,
        children: [
          { id: "3.1.p1", label: "3.1.p1 Operations and sustainment support", type: "paragraph" },
          { id: "3.1.p2", label: "3.1.p2 Capabilities across cited appendices", type: "paragraph" },
          { id: "3.1.p3", label: "3.1.p3 System security services", type: "paragraph" },
          { id: "3.1.p4", label: "3.1.p4 Continuity readiness", type: "paragraph" },
          { id: "3.1.p5", label: "3.1.p5 Resolve defects", type: "paragraph" },
          { id: "3.1.p6", label: "3.1.p6 Technical support for listed capabilities", type: "paragraph", selected: true },
          { id: "3.1.p7", label: "3.1.p7 Exercise support", type: "paragraph" },
          {
            id: "3.1.1",
            label: "3.1.1 Map Stack",
            type: "subsection",
            children: [{ id: "3.1.1.p1", label: "3.1.1.p1 Sustain Map Stack", type: "paragraph" }],
          },
        ],
      },
      {
        id: "3.2",
        label: "3.2 Integration and Visualization",
        type: "section",
        children: [
          { id: "3.2.p1", label: "3.2.p1 Integrate data sources", type: "paragraph" },
          { id: "3.2.2.p1", label: "3.2.2.p1 LSeg integration", type: "paragraph" },
        ],
      },
    ],
  },
];

export const queueRows = [
  { item: "3.1.p6", title: "Technical support requirement", cited: "Base IDIQ 4.10", docs: "Appendix A, C, E", reviewer: "Unassigned", status: "Ready" },
  { item: "3.1.p11", title: "ArcGIS Earth client support", cited: "Appendix C", docs: "3D Globe", reviewer: "Operations", status: "Needs Check" },
  { item: "3.2.2.p1", title: "LSeg sensor integration", cited: "Appendix E", docs: "Sensor Integration", reviewer: "Sensors", status: "Ready" },
];

export const detail = {
  id: "3.1.p6",
  section: "3.1 Operation and Sustainment",
  text:
    "The Contractor must provide technical support IAW section 4.10 of the Strata IDIQ Base PWS for the use of each capability listed in Appendices A – E, H and I.",
  governing: {
    source: "Strata Base IDIQ PWS.docx",
    cite: "4.10",
    title: "Technical Support",
    excerpt:
      "Services to provide an interactive, dynamic, and collaborative network of technical information, knowledge, skill, and support made available to users and administrators of mission capabilities.",
  },
  related: [
    {
      source: "STRATA_TO1_PWS_Appendix_A_Map_Stack_v6.docx",
      cite: "APPENDIX A",
      section: "1.1",
      title: "Map Stack",
      excerpt:
        "The Map Stack capability comprises several components that enable advanced visualization and analysis workflows for supported users.",
    },
    {
      source: "STRATA_TO1_PWS_Appendix_C_3D_Globe_v5.docx",
      cite: "APPENDIX C",
      section: "1.1",
      title: "3D Globe Visualization and KML Support",
      excerpt:
        "The client is made available for download and use through the Service Landing Page on each supported network domain.",
    },
    {
      source: "STRATA_TO1_PWS_Appendix_E_Sensor_Integration_v6.docx",
      cite: "APPENDIX E",
      section: "1.1",
      title: "Sensor Integration",
      excerpt:
        "Deployed LSeg capabilities provide data discovery, visualization, and analytics for specific sensor products.",
    },
  ],
  audit: [
    { label: "Explicit section citation", value: "4.10 detected" },
    { label: "Explicit appendix references", value: "A, B, C, D, E, H, I" },
    { label: "Linking policy", value: "Cited sources only" },
    { label: "LLM usage", value: "Disabled for first pass" },
  ],
};
