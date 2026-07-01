import { createConnectTransport } from '@connectrpc/connect-web'
import { createClient, Transport } from '@connectrpc/connect'
import { TodosService } from '@template/proto'
import { workersFetch } from './workersFetch'

let cachedTransport: Transport | undefined;
let cachedBaseUrl: string | undefined;

export function getTodoClient(baseUrl: string, token: string) {
  if (!cachedTransport || cachedBaseUrl !== baseUrl) {
    cachedTransport = createConnectTransport({ baseUrl: `${baseUrl}/connect`, useBinaryFormat: true, fetch: workersFetch });
    cachedBaseUrl = baseUrl;
  }
  
  const client = createClient(TodosService, cachedTransport);
  return {
    client,
    options: {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  };
}
