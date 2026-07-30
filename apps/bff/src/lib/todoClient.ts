import { createClient } from '@connectrpc/connect'
import { TodosService } from '@template/proto'
import { getTransport } from './transport'

export function getTodoClient(baseUrl: string, token: string) {
  const client = createClient(TodosService, getTransport(baseUrl));
  return {
    client,
    options: {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  };
}
