import BOQBudgetBreakdownPage from '../qs/BOQBudgetBreakdownPage';

export default function BudgetPage() {
  return (
    <BOQBudgetBreakdownPage
      lockedView="costhead"
      pageTitle="Budget Control"
      pageSubtitle="Cost head budget allocation vs actual expenditure"
    />
  );
}
