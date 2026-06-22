// Rental Category Master — BCIM Engineering Private Limited
// Drives all category-specific behaviour: TDS sections, approval chains,
// dynamic fields, document requirements, and bill number prefixes.

export const RENTAL_CATEGORIES = [
  {
    code: 'CRANE',
    label: 'Crane Hire',
    units: ['Hours', 'Days', 'Shifts'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Equipment hire charges',
    requiresLogSheet: true,
    approvalChain: ['Site Engineer', 'Plant In-charge', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['capacity_tons', 'operator_name', 'helper_count', 'reg_no'],
    documents: ['Log Sheet', 'Deployment Challan'],
    billPrefix: 'CRN',
  },
  {
    code: 'HYDRA',
    label: 'Hydra Hire',
    units: ['Hours', 'Days', 'Shifts'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Equipment hire charges',
    requiresLogSheet: true,
    approvalChain: ['Site Engineer', 'Plant In-charge', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['capacity_tons', 'operator_name', 'reg_no'],
    documents: ['Log Sheet', 'Deployment Challan'],
    billPrefix: 'HYD',
  },
  {
    code: 'PUMP',
    label: 'Pump Hire',
    units: ['Hours', 'Days', 'Months'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Plant & machinery hire',
    requiresLogSheet: false,
    approvalChain: ['Site Engineer', 'Plant In-charge', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['pump_type', 'capacity_lps', 'hours_meter_reading'],
    documents: ['Usage Log', 'Site Engineer Certificate'],
    billPrefix: 'PMP',
  },
  {
    code: 'GENSET',
    label: 'DG / Generator Hire',
    units: ['Hours', 'KWH', 'Days'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Power & fuel hire',
    requiresLogSheet: false,
    approvalChain: ['Site Engineer', 'Plant In-charge', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['kva_rating', 'fuel_included', 'kwh_reading', 'hours_reading'],
    documents: ['Hourly Log', 'Fuel Statement'],
    billPrefix: 'DG',
  },
  {
    code: 'VEHICLE',
    label: 'Vehicle / Tipper Hire',
    units: ['Trips', 'Days', 'KM'],
    sac: '9964',
    tdsSection: '194C',
    tdsRate: { company: 1, individual: 1 },
    costHead: 'Transportation charges',
    requiresLogSheet: false,
    approvalChain: ['Site Supervisor', 'Transport In-charge', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['vehicle_no', 'driver_name', 'trip_count', 'km_reading'],
    documents: ['Trip Sheet', 'Delivery Challans'],
    billPrefix: 'VEH',
  },
  {
    code: 'SCAFFOLD',
    label: 'Scaffolding Hire',
    units: ['Days', 'Months', 'Sqft'],
    sac: '9954',
    tdsSection: '194C',
    tdsRate: { company: 1, individual: 1 },
    costHead: 'Formwork & scaffolding charges',
    requiresLogSheet: false,
    approvalChain: ['Site Engineer', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['area_sqft', 'floors', 'scaffold_type'],
    documents: ['Measurement Sheet', 'Site Certificate'],
    billPrefix: 'SCF',
  },
  {
    code: 'FORMWORK',
    label: 'Formwork / Shuttering Hire',
    units: ['Days', 'Sqft', 'Months'],
    sac: '9954',
    tdsSection: '194C',
    tdsRate: { company: 1, individual: 1 },
    costHead: 'Formwork & scaffolding charges',
    requiresLogSheet: false,
    approvalChain: ['Site Engineer', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['area_sqft', 'slab_thickness', 'formwork_type'],
    documents: ['Measurement Sheet', 'Site Certificate'],
    billPrefix: 'FWK',
  },
  {
    code: 'PRINTER',
    label: 'Printer / Plotter Hire',
    units: ['Monthly', 'Days', 'Print'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Office/IT expenses',
    requiresLogSheet: false,
    approvalChain: ['Department Head', 'Admin In-charge', 'QS', 'Finance Head'],
    dynamicFields: ['make_model', 'serial_no', 'meter_reading', 'print_count'],
    documents: ['Meter Reading Sheet', 'Monthly Invoice'],
    billPrefix: 'PRN',
  },
  {
    code: 'COMPRESSOR',
    label: 'Air Compressor Hire',
    units: ['Hours', 'Days'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Plant & machinery hire',
    requiresLogSheet: false,
    approvalChain: ['Site Engineer', 'Plant In-charge', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['capacity_cfm', 'pressure_bar', 'hours_reading'],
    documents: ['Usage Log'],
    billPrefix: 'CMP',
  },
  {
    code: 'HOIST',
    label: 'Material Hoist Hire',
    units: ['Hours', 'Days', 'Shifts'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Equipment hire charges',
    requiresLogSheet: false,
    approvalChain: ['Site Engineer', 'Plant In-charge', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: ['capacity_tons', 'operator_name'],
    documents: ['Usage Log', 'Site Certificate'],
    billPrefix: 'HST',
  },
  {
    code: 'IT_EQUIP',
    label: 'IT Equipment Hire',
    units: ['Monthly', 'Days'],
    sac: '9973',
    tdsSection: '194I',
    tdsRate: { company: 2, individual: 10 },
    costHead: 'Office/IT expenses',
    requiresLogSheet: false,
    approvalChain: ['Department Head', 'IT In-charge', 'QS', 'Finance Head'],
    dynamicFields: ['serial_no', 'asset_tag', 'department_assigned'],
    documents: ['Asset Acknowledgement'],
    billPrefix: 'ITE',
  },
  {
    code: 'OTHER',
    label: 'Other Rental',
    units: ['Custom'],
    sac: '9973',
    tdsSection: '194C',
    tdsRate: { company: 1, individual: 1 },
    costHead: 'Miscellaneous hire charges',
    requiresLogSheet: false,
    approvalChain: ['Department Head', 'Project Manager', 'QS', 'Finance Head'],
    dynamicFields: [],
    documents: ['Usage Certificate'],
    billPrefix: 'OTH',
  },
];

// Lookup by code
export const getCategoryByCode = (code) =>
  RENTAL_CATEGORIES.find(c => c.code === code) || null;

// ── Bill number formatters ─────────────────────────────────────────────────

export function billNumber(prefix, seq) {
  return `BCIM/${prefix}/2025-26/${String(seq).padStart(3, '0')}`;
}

export function logSheetNumber(prefix, seq) {
  return `BCIM/LOG/${prefix}/2025-26/${String(seq).padStart(3, '0')}`;
}

export function qsCertNumber(seq) {
  return `BCIM/QS/CERT/2025-26/${String(seq).padStart(3, '0')}`;
}

// ── Cost head → categories mapping ────────────────────────────────────────

export const COST_HEAD_MAP = {
  'Equipment hire charges':         ['CRANE', 'HYDRA', 'HOIST'],
  'Plant & machinery hire':         ['PUMP', 'COMPRESSOR'],
  'Power & fuel hire':              ['GENSET'],
  'Office/IT expenses':             ['PRINTER', 'IT_EQUIP'],
  'Transportation charges':         ['VEHICLE'],
  'Formwork & scaffolding charges': ['SCAFFOLD', 'FORMWORK'],
  'Miscellaneous hire charges':     ['OTHER'],
};
