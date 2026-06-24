// HREmployeeNav.jsx — greytHR-style secondary nav bar for HR & Admin module
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

const NAV_MENUS = [
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
      { label: 'Attendance',          to: '/hr-admin/attendance' },
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
    label: 'Admin',
    items: [
      { label: 'HR Dashboard',        to: '/hr-admin' },
      { label: 'Departments',         to: '/hr-admin/departments' },
      { label: 'Appraisals',          to: '/hr-admin/appraisals' },
      { label: 'Recruitment',         to: '/hr-admin/recruitment' },
      { label: 'Payroll',             to: '/hr-admin/payroll' },
      { label: 'Employee Salaries',   to: '/hr-admin/employee-salaries' },
      { label: 'Salary Structures',   to: '/hr-admin/salary-structures' },
      { label: 'Shifts & OT',         to: '/hr-admin/shifts' },
      { label: 'Full & Final',        to: '/hr-admin/fnf' },
      { label: 'Advanced HR',         to: '/hr-admin/advanced' },
      { label: 'HR Reports',          to: '/hr-admin/reports' },
      { label: 'Compliance Reports',  to: '/hr-admin/compliance' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Letter Template',             to: '/hr-admin/letters' },
      { label: 'Company Policies & Forms',    to: '/hr-admin/policies' },
      { label: 'Employee Segment',            to: '/hr-admin/segments' },
      { label: 'Employee Filter',             to: '/hr-admin/emp-filters' },
    ],
  },
];

function DropdownMenu({ menu, isActive, onClose }) {
  return (
    <div
      className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50"
      style={{ minWidth: 210, boxShadow: '0 8px 28px rgba(10,31,92,0.13)' }}
    >
      {menu.items.map((item) => (
        <button
          key={item.to}
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

export default function HREmployeeNav() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [open, setOpen] = useState(null); // which menu label is open
  const barRef = useRef(null);

  const isActive = (to) => {
    if (to === '/hr-admin') return location.pathname === '/hr-admin';
    return location.pathname.startsWith(to);
  };

  const anyActive = (menu) => menu.items.some(i => isActive(i.to));

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Navigate when clicking an item inside the dropdown
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
      <div className="flex items-center gap-1 px-4" style={{ height: 40 }}>
        {/* Employee label pill */}
        <button
          onClick={() => navigate('/hr-admin/employees')}
          className="flex items-center px-3.5 py-1 rounded-full text-[12px] font-bold mr-2 transition-colors"
          style={{ background: '#E8F5E9', color: '#1B5E20', border: '1px solid #A5D6A7' }}
        >
          Employee
        </button>

        {/* Dropdown menus */}
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
                <DropdownMenu menu={menu} isActive={isActive} onClose={() => setOpen(null)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
