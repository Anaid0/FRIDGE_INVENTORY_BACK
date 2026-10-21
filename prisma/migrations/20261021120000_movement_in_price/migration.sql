-- Las entradas manuales (ingresar stock, regalos) también guardan su precio unitario desde ahora.
-- Entradas manuales ya registradas: precio de la última compra (no anulada) del producto hecha hasta ese
-- momento; si no la hay, el precio de referencia del producto. Si tampoco hay, queda en NULL.
-- Solo es informativo para el historial: el consumo (cobros, rankings) sigue contando únicamente salidas.
UPDATE `inventory_movements` m
JOIN `products` pr ON pr.`id` = m.`product_id`
SET m.`unit_price` = COALESCE(
  (SELECT pi.`unit_price` FROM `purchase_items` pi JOIN `purchases` p ON p.`id` = pi.`purchase_id`
    WHERE pi.`product_id` = m.`product_id` AND p.`voided_at` IS NULL AND p.`purchased_at` <= m.`created_at`
    ORDER BY p.`purchased_at` DESC, p.`created_at` DESC LIMIT 1),
  pr.`reference_price`
)
WHERE m.`type` = 'IN' AND m.`source` = 'MANUAL' AND m.`unit_price` IS NULL;
