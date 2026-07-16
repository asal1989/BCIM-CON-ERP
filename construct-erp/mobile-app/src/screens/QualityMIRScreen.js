import makeListScreen from './generic/makeListScreen';
import { qualityAPI } from '../api/client';

export default makeListScreen({
  title: 'Material Inspection',
  icon: 'magnify-scan',
  queryKey: 'quality-mir-list',
  fetcher: (projectId) => qualityAPI.mir(projectId),
  primary: (item) => item.mir_number || `MIR #${item.id}`,
  secondary: (item) => item.material_name,
  status: (item) => item.status,
  detailScreen: 'MIRDetail',
});
