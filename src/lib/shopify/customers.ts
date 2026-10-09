import { gql, throwUserErrors } from './client';
import { toCents } from '../money';
import type { Customer } from '../types';

const F = `id displayName email phone numberOfOrders amountSpent { amount } note`;
const map = (n: any): Customer => ({ id: n.id, name: n.displayName || n.email || n.phone || 'Customer', email: n.email ?? undefined, phone: n.phone ?? undefined, orders: Number(n.numberOfOrders ?? 0), spentCents: n.amountSpent ? toCents(n.amountSpent.amount) : 0, note: n.note ?? undefined });

export async function searchRemote(q: string): Promise<Customer[]> {
  const d = await gql(`query($q:String){ customers(first: 20, query: $q) { nodes { ${F} } } }`, { q });
  return d.customers.nodes.map(map);
}
export type CustomerInput = { firstName?: string; lastName?: string; email?: string; phone?: string; note?: string };
const clean = (c: CustomerInput) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== ''));
export async function createCustomer(c: CustomerInput): Promise<Customer> {
  const d = await gql(`mutation($i: CustomerInput!){ customerCreate(input: $i) { customer { ${F} } userErrors { field message } } }`, { i: clean(c) });
  throwUserErrors(d.customerCreate.userErrors, 'Creating the customer');
  return map(d.customerCreate.customer);
}
export async function updateCustomer(id: string, c: CustomerInput): Promise<Customer> {
  const d = await gql(`mutation($i: CustomerInput!){ customerUpdate(input: $i) { customer { ${F} } userErrors { field message } } }`, { i: { id, ...clean(c) } });
  throwUserErrors(d.customerUpdate.userErrors, 'Updating the customer');
  return map(d.customerUpdate.customer);
}
