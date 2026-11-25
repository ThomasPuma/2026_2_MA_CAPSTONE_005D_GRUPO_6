# Webpay Plus: datos para probar pagos

La aplicación está configurada por defecto en **ambiente de integración**
(`WEBPAY_ENVIRONMENT=integration`). En este ambiente:

- **no se cobra dinero real**;
- no necesitas credenciales de producción;
- puedes usar tarjetas de prueba las veces que quieras.

## Credenciales públicas de integración

El SDK de Transbank ya las trae configuradas y la aplicación las usa
automáticamente cuando `WEBPAY_ENVIRONMENT=integration`:

| Dato | Valor |
| --- | --- |
| Código de comercio | `597055555532` |
| API Key Secret | `579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C` |
| Host | `https://webpay3gint.transbank.cl` |

Si quieres dejarlas explícitas, puedes descomentar `WEBPAY_COMMERCE_CODE` y
`WEBPAY_API_KEY` en `backend/.env`.

## Tarjetas de prueba oficiales

| Tarjeta | Número | CVV | Vencimiento | Resultado |
| --- | --- | --- | --- | --- |
| VISA | `4051 8856 0044 6623` | `123` | Cualquier fecha futura | Aprobada |
| AMEX | `3700 0000 0002 032` | `1234` | Cualquier fecha futura | Aprobada |
| Mastercard | `5186 0595 5959 0568` | `123` | Cualquier fecha futura | Rechazada |
| Redcompra | `4051 8842 3993 7763` | — | — | Aprobada |
| Redcompra | `4511 3466 6003 7060` | — | — | Aprobada |
| Redcompra | `5186 0085 4123 3829` | — | — | Rechazada |
| Prepago VISA | `4051 8860 0005 6590` | `123` | Cualquier fecha futura | Aprobada |
| Prepago Mastercard | `5186 1741 1062 9480` | `123` | Cualquier fecha futura | Rechazada |

> Para probar el flujo más simple usa la VISA `4051 8856 0044 6623`, CVV `123`
> y una fecha de vencimiento futura.

## Autenticación bancaria

Cuando Webpay muestre el formulario del banco, usa:

| Campo | Valor |
| --- | --- |
| RUT | `11.111.111-1` |
| Clave | `123` |

## Cómo probar el flujo completo

1. Agrega un producto al carrito.
2. Completa los datos del pedido.
3. Elige **Tarjeta online (Webpay)**.
4. Presiona **Enviar pedido**.
5. En la pasarela de Webpay ingresa una tarjeta de prueba.
6. Si usas la VISA aprobada, vuelves a la tienda con el pedido marcado como
   **Pagado**. Si usas la Mastercard rechazada, el cupo se libera y el carrito
   queda disponible para reintentar.

## Probar un abono de pedido grande

Agrega productos por **más de $60.000** (por ejemplo, 2 paquetes de 100 mini
berlines). Al confirmar:

- el pedido queda con un **abono por defecto del 25%**, o con **pago completo**
  si eliges la opción "Pagar el pedido completo ahora";
- si eliges **Webpay**, la pasarela cobra solo ese 25% y el resto queda como
  saldo pendiente (o el 100% si elegiste pago completo);
- si eliges **efectivo o tarjeta presencial**, igual te redirigimos a Webpay
  para pagar el abono; el saldo lo pagas al retirar;
- si eliges **transferencia**, el pedido queda como **abono pendiente** hasta
  que la dueña lo registre en `/admin`.

Puedes probar el flujo completo con la VISA de prueba; el saldo restante no se
cobra en la pasarela. Si eliges pago completo con transferencia, el pedido
queda pendiente hasta que la dueña registre el total recibido.

## Producción

Estos datos **no sirven en producción**. Para cobrar con tarjetas reales
Transbank debe afiliarte, entregarte un código de comercio y una API Key
Secret productivos, y luego debes configurar:

```env
WEBPAY_ENVIRONMENT=production
WEBPAY_COMMERCE_CODE=tu_codigo_de_comercio
WEBPAY_API_KEY=tu_api_key_secreta
PUBLIC_BASE_URL=https://tudominio.cl
```

Ten en cuenta que en producción Transbank cobra una comisión por transacción.
