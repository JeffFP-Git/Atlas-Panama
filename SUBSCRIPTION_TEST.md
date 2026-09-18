# Subscription Form Testing Guide

## Local Testing

### 1. Start the API Server

```bash
node api.js
```

The API will start on `http://localhost:3000` (or the port specified in your `.env` file).

### 2. Open the Subscription Form

Open your browser and navigate to:
```
http://localhost:3000/subscribe.html
```

### 3. Test the Form

#### For Inmueble (Property):
1. Enter your email address
2. Select "C. Inmueble"
3. Enter Folio (e.g., `97213`)
4. Enter Código de Ubicación (e.g., `8308`)
5. Click "Enviar Email para Confirmar"

#### For Mercantil (Business):
1. Enter your email address
2. Select "A. Mercantil – SA, Corp, Inc, or SRL"
3. Enter Name or Folio
4. Click "Enviar Email para Confirmar"

#### For Fundación (Foundation):
1. Enter your email address
2. Select "B. Fundación"
3. Enter Name or Folio
4. Click "Enviar Email para Confirmar"

### 4. Confirmation Page

After submitting, you'll see a confirmation page with three options:
- **A. Correcto** - Proceeds to payment page (placeholder)
- **B. Incorrecto** - Returns to form to try again
- **C. Contactarnos** - Opens email to info@atlaspanama.com

## API Endpoints

### Submit Subscription
```
POST /subscribe/submit
Body: {
  "email": "user@example.com",
  "tipo": "inmueble" | "mercantil" | "fundacion",
  "folio": "97213",  // for inmueble
  "codigo": "8308",   // for inmueble
  "nameOrFolio": "Company Name"  // for mercantil/fundacion
}
```

### Get Request Status
```
GET /subscribe/request/:id
```

### Confirm Request
```
POST /subscribe/request/:id/confirm
Body: {
  "isCorrect": true | false
}
```

## Notes

- The form automatically calls the appropriate pipeline:
  - **Inmueble** → `runIntroPropertyIntelPipeline`
  - **Mercantil/Fundación** → `runIntroFincaPipeline`
- All pipelines run in headless mode by default
- Email notifications are sent using the configured email settings
- Request data is stored in `data/intro-requests.json`

