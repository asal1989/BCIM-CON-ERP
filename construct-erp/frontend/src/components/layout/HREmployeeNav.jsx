// HREmployeeNav.jsx — secondary nav bar for HR & Admin module
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

const NAV_MENUS = [
  {
    label: 'Masters',
    items: [
      { label: 'Company Settings',       to: '/hr-admin/company-settings' },
      { label: 'Master Settings',        to: '/hr-admin/master-settings' },
      { label: 'Mail Settings',          to: '/admin/mail' },
      { label: 'SMS Settings',           to: '/hr-admin/sms-settings' },
      { label: 'Shift Details',          to: '/hr-admin/shifts' },
      { label: 'Shift Calendar',         to: '/hr-admin/shift-calendar' },
      { label: 'Shift Roster',           to: '/hr-admin/shift-roster' },
      { label: 'Leave Types',            to: '/hr-admin/leaves' },
      { label: 'Employee Categories',    to: '/hr-admin/emp-categories' },
      { label: 'Public Holidays',        to: '/hr-admin/holidays' },
      { label: 'Departments',            to: '/hr-admin/departments' },
      { label: 'Employees',              to: '/hr-admin/employees' },
      { label: 'Employees Shifts',       to: '/hr-admin/emp-shifts' },
      { label: 'Employees Shift Schedule', to: '/hr-admin/shift-schedule' },
      { label: 'Employees Leave Entries', to: '/hr-admin/leave-entries' },
      { label: 'Employee OutDoor Entries', to: '/hr-admin/outdoor-entries' },
      { label: 'Attendance Log',         to: '/hr-admin/attendance' },
      { label: 'Employee OT Register',   to: '/hr-admin/attendance' },
      { label: 'Geofences',              to: '/hr-admin/geofences' },
      { label: 'Manage Work Code',       to: '/hr-admin/work-codes' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Daily Attendance',      to: '/hr-admin/reports/daily-attendance' },
      { label: 'Monthly Status',        to: '/hr-admin/reports/monthly-status' },
      { label: 'Attendance Summary',    to: '/hr-admin/reports/attendance-summary' },
      { label: 'Department Summary',    to: '/hr-admin/reports/dept-summary' },
      { label: 'Leave Summary',         to: '/hr-admin/reports/leave-summary' },
      { label: 'Yearly Summary',        to: '/hr-admin/reports/yearly-summary' },
      { label: 'Employee Details',      to: '/hr-admin/reports/employee-details' },
      { label: 'Log Records',           to: '/hr-admin/reports/log-records' },
      { label: 'Shift Schedule',        to: '/hr-admin/reports/shift-schedule' },
      { label: 'Random Check',          to: '/hr-admin/reports/random-check' },
      { label: 'Recalculate',           to: '/hr-admin/attendance/recalculate' },
    ],
  },
  {
    label: 'Main',
    items: [
      { label: 'Analytics Hub',       to: '/hr-admin/analytics' },
      { label: 'Employee Directory',  to: '/hr-admin/directory' },
      { label: 'Organization Chart',  to: '/hr-admin/org-chart' },
    ],
  },
  {
    label: 'Information',
    items: [
      { label: 'Employees',           to: '/hr-admin/employees' },
      { label: 'Leave Management',    to: '/hr-admin/leaves' },
      { label: 'Holiday Calendar',    to: '/hr-admin/holidays' },
      { label: 'Expense Claims',      to: '/hr-admin/expenses' },
      { label: 'Loans & Advances',    to: '/hr-admin/loans' },
      { label: 'Employee Assets',     to: '/hr-admin/emp-assets' },
      { label: 'Travel Requests',     to: '/hr-admin/travel' },
      { label: 'Training',            to: '/hr-admin/training' },
    ],
  },
  {
    label: 'Attendance',
    mega: true,
    groups: [
      {
        heading: 'Shift Management',
        items: [
          { label: 'Shift Master',          to: '/hr-admin/shifts' },
          { label: 'Shift Assignment',      to: '/hr-admin/shifts' },
          { label: 'Shift Rotation',        to: '/hr-admin/shifts' },
          { label: 'Weekly Off Config',     to: '/hr-admin/shifts' },
        ],
      },
      {
        heading: 'Employee Rosters',
        items: [
          { label: 'Create Rosters',        to: '/hr-admin/advanced' },
          { label: 'Site-wise Rosters',     to: '/hr-admin/advanced' },
          { label: 'Team Rosters',          to: '/hr-admin/advanced' },
          { label: 'Rotation Schedule',     to: '/hr-admin/advanced' },
        ],
      },
      {
        heading: 'Overtime (OT)',
        items: [
          { label: 'OT Requests',           to: '/hr-admin/attendance' },
          { label: 'OT Approval',           to: '/hr-admin/attendance' },
          { label: 'OT Register',           to: '/hr-admin/attendance' },
          { label: 'OT Calculation',        to: '/hr-admin/attendance' },
        ],
      },
      {
        heading: 'Late & Early Exit',
        items: [
          { label: 'Late Entry Register',   to: '/hr-admin/attendance' },
          { label: 'Early Exit Register',   to: '/hr-admin/attendance' },
          { label: 'Grace Time Settings',   to: '/hr-admin/advanced' },
          { label: 'Penalty Rules',         to: '/hr-admin/advanced' },
        ],
      },
      {
        heading: 'Attendance Exceptions',
        items: [
          { label: 'Missing Punches',       to: '/hr-admin/essl-sync' },
          { label: 'Double Punches',        to: '/hr-admin/attendance' },
          { label: 'Invalid Attendance',    to: '/hr-admin/attendance' },
          { label: 'Attendance Conflicts',  to: '/hr-admin/attendance' },
        ],
      },
      {
        heading: 'Attendance Approvals',
        items: [
          { label: 'Regularization',        to: '/hr-admin/attendance/regularization' },
          { label: 'Manager Approval',      to: '/hr-admin/advanced' },
          { label: 'HR Approval',           to: '/hr-admin/advanced' },
          { label: 'Attendance Lock',       to: '/hr-admin/attendance' },
        ],
      },
      {
        heading: 'Site Attendance',
        items: [
          { label: 'Project-wise',          to: '/hr-admin/attendance' },
          { label: 'Contractor',            to: '/hr-admin/attendance' },
          { label: 'Labour Attendance',     to: '/attendance' },
          { label: 'Subcontractor',         to: '/hr-admin/attendance' },
          { label: 'Visitor Attendance',    to: '/hr-admin/attendance' },
        ],
      },
      {
        heading: 'Attendance Policies',
        items: [
          { label: 'Working Hours',         to: '/hr-admin/advanced' },
          { label: 'Grace Time',            to: '/hr-admin/advanced' },
          { label: 'Half-Day Rules',        to: '/hr-admin/advanced' },
          { label: 'Weekly Off Rules',      to: '/hr-admin/shifts' },
          { label: 'Holiday Rules',         to: '/hr-admin/holidays' },
          { label: 'Biometric Config',      to: '/hr-admin/essl-sync' },
        ],
      },
      {
        heading: 'Reports',
        items: [
          { label: 'Timesheet Report',       to: '/hr-admin/attendance/timesheet' },
          { label: 'Monthly Attendance',    to: '/hr-admin/attendance' },
          { label: 'Daily Attendance',      to: '/hr-admin/attendance' },
          { label: 'Dept Attendance',       to: '/hr-admin/attendance' },
          { label: 'Overtime Report',       to: '/hr-admin/attendance' },
          { label: 'Late Arrival Report',   to: '/hr-admin/attendance' },
          { label: 'Missing Punch Report',  to: '/hr-admin/essl-sync' },
          { label: 'Absentee Report',       to: '/hr-admin/attendance' },
        ],
      },
      {
        heading: 'Analytics',
        items: [
          { label: 'Attendance Trends',     to: '/hr-admin/analytics' },
          { label: 'Monthly Heatmap',       to: '/hr-admin/analytics' },
          { label: 'Productivity Analysis', to: '/hr-admin/analytics' },
          { label: 'Dept Comparison',       to: '/hr-admin/analytics' },
          { label: 'Site Comparison',       to: '/hr-admin/analytics' },
        ],
      },
    ],
  },
];

// Simple single-level dropdown
function DropdownMenu({ menu, isActive, onClose }) {
  return (
    <div
      className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50"
      style={{ minWidth: 210, boxShadow: '0 8px 28px rgba(10,31,92,0.13)' }}
    >
      {menu.items.map((item) => (
        <button
          key={item.to + item.label}
          onClick={() => { onClose(); }}
          data-to={item.to}
          className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition-colors"
          style={{ fontWeight: isActive(item.to) ? 700 : 500 }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0"/>
          {item.label}
        </button>
      ))}
    </div>
  );
}

// Mega-menu with grouped columns
function MegaMenu({ menu, isActive, onClose }) {
  return (
    <div
      className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-50"
      style={{
        boxShadow: '0 12px 40px rgba(10,31,92,0.16)',
        width: 'min(960px, 90vw)',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
    >
      {/* Quick access bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-blue-50 rounded-t-xl">
        <button
          data-to="/hr-admin/attendance"
          onClick={onClose}
          className="text-[12px] font-black text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-700 hover:text-white transition-colors"
        >
          Attendance Grid
        </button>
        <button
          data-to="/hr-admin/attendance/dashboard"
          onClick={onClose}
          className="text-[12px] font-black text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-700 hover:text-white transition-colors"
        >
          Dashboard
        </button>
        <button
          data-to="/hr-admin/attendance/regularization"
          onClick={onClose}
          className="text-[12px] font-black text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-700 hover:text-white transition-colors"
        >
          Regularization
        </button>
        <button
          data-to="/hr-admin/essl-sync"
          onClick={onClose}
          className="text-[12px] font-black text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-700 hover:text-white transition-colors"
        >
          ESSL Sync
        </button>
        <button
          data-to="/hr-admin/attendance/timesheet"
          onClick={onClose}
          className="text-[12px] font-black text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-700 hover:text-white transition-colors"
        >
          Timesheet Report
        </button>
        <button
          data-to="/hr-admin/shifts"
          onClick={onClose}
          className="text-[12px] font-black text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-700 hover:text-white transition-colors"
        >
          Shift Management
        </button>
        <button
          data-to="/hr-admin/advanced"
          onClick={onClose}
          className="text-[12px] font-black text-blue-700 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-700 hover:text-white transition-colors"
        >
          Advanced / Regularization
        </button>
      </div>

      {/* Groups grid */}
      <div className="grid p-4 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {menu.groups.map((group) => (
          <div key={group.heading}>
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1.5 px-1">
              {group.heading}
            </div>
            {group.items.map((item) => (
              <button
                key={item.label}
                data-to={item.to}
                onClick={onClose}
                className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 text-[12px] rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors"
                style={{
                  color: isActive(item.to) ? '#2563EB' : '#374151',
                  fontWeight: isActive(item.to) ? 700 : 500,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"/>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HREmployeeNav() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [open, setOpen] = useState(null);
  const barRef = useRef(null);

  const isActive = (to) => {
    if (to === '/hr-admin') return location.pathname === '/hr-admin';
    return location.pathname.startsWith(to);
  };

  const anyActive = (menu) => {
    if (menu.mega) return menu.groups.some(g => g.items.some(i => isActive(i.to)));
    return menu.items.some(i => isActive(i.to));
  };

  useEffect(() => {
    const handler = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleItemClick = (e) => {
    const btn = e.target.closest('[data-to]');
    if (btn) {
      navigate(btn.getAttribute('data-to'));
      setOpen(null);
    }
  };

  return (
    <div
      ref={barRef}
      className="bg-white border-b border-gray-100 print:hidden"
      style={{ boxShadow: '0 1px 4px rgba(10,31,92,0.06)' }}
      onClick={handleItemClick}
    >
      <div
        className="flex items-center gap-1 px-4 h-scroll-bar"
        style={{ height: 40, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Employee label pill */}
        <button
          onClick={() => navigate('/hr-admin/employees')}
          className="flex items-center px-3.5 py-1 rounded-full text-[12px] font-bold mr-2 transition-colors"
          style={{ background: '#E8F5E9', color: '#1B5E20', border: '1px solid #A5D6A7' }}
        >
          Employee
        </button>

        {NAV_MENUS.map((menu) => {
          const active = anyActive(menu);
          const isOpen = open === menu.label;
          return (
            <div key={menu.label} className="relative">
              <button
                onClick={() => setOpen(isOpen ? null : menu.label)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                  active || isOpen
                    ? 'text-blue-700 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {menu.label}
                <ChevronDown
                  size={12}
                  className="transition-transform"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {isOpen && (
                menu.mega
                  ? <MegaMenu menu={menu} isActive={isActive} onClose={() => setOpen(null)} />
                  : <DropdownMenu menu={menu} isActive={isActive} onClose={() => setOpen(null)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
