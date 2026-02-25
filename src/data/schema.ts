import { z } from 'zod';

export const canonicalColumns = ['cust_id','cust_name','country','territory','prod_group','prod_group_desc','part_num','line_desc','class_id','class_desc','invoice_num','invoice_date','order_num','amount','cost'] as const;

export const rowSchema = z.object({
  cust_id: z.string(), cust_name: z.string(), country: z.string(), territory: z.string(),
  prod_group: z.string(), prod_group_desc: z.string(), part_num: z.string(), line_desc: z.string(),
  class_id: z.string(), class_desc: z.string(), invoice_num: z.string(), invoice_date: z.string(),
  order_num: z.string(), amount: z.number(), cost: z.number().nullable()
});
export type CanonicalRow = z.infer<typeof rowSchema>;
