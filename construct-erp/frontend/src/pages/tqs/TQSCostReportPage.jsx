import BOQBudgetBreakdownPage from '../qs/BOQBudgetBreakdownPage';

export default function TQSCostReportPage() {
  return (
    <BOQBudgetBreakdownPage
      lockedView="costhead"
      pageTitle="Cost Report"
      pageSubtitle="Budget vs committed (POs) vs actual billed — per cost head"
    />
  );
}
