import makeListScreen from './generic/makeListScreen';
import { itTicketAPI } from '../api/client';

export default makeListScreen({
  title: 'IT Tickets',
  icon: 'ticket-confirmation-outline',
  queryKey: 'it-tickets-list',
  projectScoped: false,
  fetcher: () => itTicketAPI.list(),
  primary: (item) => item.ticket_number || `Ticket #${item.id}`,
  secondary: (item) => item.subject || item.description,
  meta: (item) => item.priority ? `Priority: ${item.priority}` : null,
  status: (item) => item.status,
  detailScreen: 'ITTicketDetail',
});
