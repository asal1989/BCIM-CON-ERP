import makeListScreen from './generic/makeListScreen';
import { subcontractorAPI } from '../api/client';

export default makeListScreen({
  title: 'Subcontractors',
  icon: 'account-hard-hat',
  queryKey: 'subcontractors-list',
  projectScoped: false,
  fetcher: () => subcontractorAPI.list(),
  primary: (item) => item.name || item.sc_code || `SC #${item.id}`,
  secondary: (item) => item.trade_type || item.contractor_type,
  meta: (item) => item.contact_person || null,
  status: (item) => item.status,
});
