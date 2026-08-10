import React from 'react';
import { ShieldCheck } from 'lucide-react';
import ChecklistTrackerPage from './ChecklistTrackerPage';

export default function OnboardingComplianceFormsPage() {
  return (
    <ChecklistTrackerPage
      title="Compliance Forms"
      description="Company policy acknowledgement and NDA sign-off for new hires."
      icon={ShieldCheck}
      filterParams={{ item_key: 'policy_ack,nda_signed' }}
    />
  );
}
