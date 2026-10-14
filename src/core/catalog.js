// What the model is allowed to say. Hours are the author's own estimates for a solo
// developer who uses AI coding tools; edit them in the app's profile panel.

export const COMPONENTS = {
  page:            { label: 'Content page',              hours: [2, 4],    perUnit: true },
  cms:             { label: 'Client-editable content',   hours: [6, 12] },
  login:           { label: 'User accounts / login',     hours: [10, 20] },
  payments:        { label: 'Payments / checkout',       hours: [12, 24] },
  admin_dashboard: { label: 'Admin dashboard / reports', hours: [16, 40] },
  booking:         { label: 'Booking / scheduling',      hours: [12, 24] },
  integration:     { label: 'Third-party API integration', hours: [8, 20], perUnit: true },
  data_migration:  { label: 'Data migration',            hours: [16, 60] },
  catalog:         { label: 'Product catalog',           hours: [12, 28] },
  multilingual:    { label: 'Second language',           hours: [4, 10] },
  chatbot:         { label: 'Chat bot (LINE / Telegram / web)', hours: [12, 30] },
  points:          { label: 'Points / loyalty logic',    hours: [16, 30] },
  maps_realtime:   { label: 'Live maps / real-time tracking', hours: [24, 60] },
  ai_feature:      { label: 'AI feature',                hours: [10, 30] },
  design:          { label: 'Custom visual design',      hours: [6, 16] },
  native_app:      { label: 'Native mobile app',         hours: [120, 300], outOfStack: true },
  game:            { label: 'Game',                      hours: [200, 600], outOfStack: true },
  shopify_theme:   { label: 'Shopify Liquid theme',      hours: [10, 30],   outOfStack: true },
  no_code_platform:{ label: 'Build on a no-code platform I do not use', hours: [20, 60], outOfStack: true },
  erp_suite:       { label: 'Multi-department ERP',      hours: [150, 400], outOfStack: true },
  hardware:        { label: 'Hardware / machines',       hours: [40, 120],  outOfStack: true },
};

export const BASE_HOURS = [4, 8]; // setup, deploy, handover

export const FLAGS = {
  onsite:         { label: 'Must be on site',               hard: true },
  tos_grey:       { label: 'Breaks a platform\'s rules',    hard: true },
  pay_on_success: { label: 'Paid only if it succeeds',      hard: true },
  unpaid_work:    { label: 'Unpaid test work',              hard: true },
  off_platform:   { label: 'Wants to move off the platform early', hard: false },
  clone_big_app:  { label: '"Like Uber/Airbnb" clone',      hard: false },
  rush:           { label: 'Deadline too short for the scope', hard: false },
  vague_scope:    { label: 'Scope is vague',                hard: false },
  unlimited_revisions: { label: 'Unlimited revisions',      hard: false },
};
