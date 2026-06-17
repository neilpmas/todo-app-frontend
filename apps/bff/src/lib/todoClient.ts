import { createGrpcWebTransport } from '@connectrpc/connect-web'
import { createClient, Transport } from '@connectrpc/connect'
import { TodosService } from '@template/proto'

let cachedTransport: Transport | undefined;
let cachedBaseUrl: string | undefined;

export function getTodoClient(baseUrl: string, token: string) {
  if (!cachedTransport || cachedBaseUrl !== baseUrl) {
    cachedTransport = createGrpcWebTransport({ baseUrl });
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
