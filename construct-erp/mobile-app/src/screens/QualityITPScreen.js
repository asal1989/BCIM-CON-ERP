import makeListScreen from './generic/makeListScreen';
import { qualityAPI } from '../api/client';

export default makeListScreen({
  title: 'Inspection Test Plans',
  icon: 'clipboard-check-outline',
  queryKey: 'quality-itp-list',
  fetcher: (projectId) => qualityAPI.itp(projectId),
  primary: (item) => item.itp_number || item.title || `ITP #${item.id}`,
  secondary: (item) => item.activity_name || item.description,
  status: (item) => item.status,
  detailScreen: 'ITPDetail',
});
