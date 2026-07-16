import makeListScreen from './generic/makeListScreen';
import { incidentAPI } from '../api/client';

export default makeListScreen({
  title: 'Incidents',
  icon: 'alert-octagon-outline',
  queryKey: 'incidents-list',
  fetcher: (projectId) => incidentAPI.list(projectId),
  primary: (item) => item.incident_number || `Incident #${item.id}`,
  secondary: (item) => item.description || item.title,
  meta: (item) => item.incident_date ? `${item.incident_date} · ${item.severity || ''}` : null,
  status: (item) => item.status,
  detailScreen: 'IncidentDetail',
});
