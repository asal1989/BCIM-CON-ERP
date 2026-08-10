import React from 'react';
import { CalendarCheck } from 'lucide-react';
import ChecklistTrackerPage from './ChecklistTrackerPage';

export default function OrientationSchedulePage() {
  return (
    <ChecklistTrackerPage
      title="Orientation Schedule"
      description="Safety induction, HR orientation and team introductions for new hires — set a date, mark complete."
      icon={CalendarCheck}
      filterParams={{ item_key: 'safety_induction,orientation,manager_intro' }}
    />
  );
}
