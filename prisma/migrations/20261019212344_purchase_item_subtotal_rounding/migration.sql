-- Compras por paquetes o por total: el subtotal es lo pagado y el precio unitario es subtotal ÷ cantidad
-- redondeado al centavo (p. ej. $20.600 ÷ 12 = $1.716,67). Se acepta la diferencia de ese redondeo:
-- a lo sumo medio centavo por unidad.
ALTER TABLE `purchase_items` DROP CHECK `chk_item_subtotal`;
ALTER TABLE `purchase_items`
    ADD CONSTRAINT `chk_item_subtotal` CHECK (
        `subtotal` >= 0 AND ABS(`subtotal` - `quantity` * `unit_price`) <= `quantity` * 0.005
    );
