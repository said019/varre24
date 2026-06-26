export type OrderStatus =
  | "pending_payment"
  | "pending_verification"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export interface Order {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  amount?: number;
  total_amount?: number;
  subtotal?: number;
  currency: string;
  status: OrderStatus;
  payment_method: string;
  bank_clabe?: string;
  bank_name?: string;
  bank_account_holder?: string;
  proof_url?: string;
  admin_notes?: string;
  card_fee_amount?: number;
  rejection_reason?: string;
  // MercadoPago (pago con tarjeta en línea):
  payment_provider?: string | null;
  payment_intent_id?: string | null;
  mp_checkout_url?: string | null;
  mp_payment_id?: string | null;
  mp_payment_status?: string | null;
  mp_status_detail?: string | null;
  created_at: string;
  updated_at: string;
  // Grupo B — Cobro por transferencia
  auto_approved_at?: string | null;
  auto_approval_expires_at?: string | null;
  auto_reverted_at?: string | null;
  proofs?: PaymentProof[];
}

export interface PaymentProof {
  id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  status: string;
  uploaded_at: string;
  sort_order: number;
}

export interface CreateOrderRequest {
  planId: string;
  discountCode?: string;
  paymentMethod: "transfer" | "card";
  complementType?: string;
}

export interface CreateOrderResponse extends Order {
  plan_name: string;
  mp_checkout_url?: string | null;
  bank_details?: Record<string, unknown> & { amount?: number; currency?: string };
}
