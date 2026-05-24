import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Ensure /public directory and PWA logo assets exist
try {
  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Create public/src/assets/images for exact matching paths
  const publicImagesDir = path.join(publicDir, "src", "assets", "images");
  if (!fs.existsSync(publicImagesDir)) {
    fs.mkdirSync(publicImagesDir, { recursive: true });
  }
  
  const logoSource = path.join(process.cwd(), "src/assets/images/radio_alfa_logo_1779323079816.png");
  if (fs.existsSync(logoSource)) {
    const dest192 = path.join(publicDir, "logo-192.png");
    const dest512 = path.join(publicDir, "logo-512.png");
    fs.copyFileSync(logoSource, dest192);
    fs.copyFileSync(logoSource, dest512);

    // Also copy to public/src/assets/images/ for exact runtime static match
    fs.copyFileSync(logoSource, path.join(publicImagesDir, "radio_alfa_logo_1779323079816.png"));
    console.log("PWA logo assets successfully synchronized into public folder.");
  } else {
    console.warn("PWA source logo not found at:", logoSource);
  }

  const crossSource = path.join(process.cwd(), "src/assets/images/christian_cross_1779324126280.png");
  if (fs.existsSync(crossSource)) {
    // Copy to public/src/assets/images/ for absolute match in station covers
    fs.copyFileSync(crossSource, path.join(publicImagesDir, "christian_cross_1779324126280.png"));
    // Also copy to root level of public just in case
    fs.copyFileSync(crossSource, path.join(publicDir, "christian_cross_1779324126280.png"));
    console.log("PWA Christian cross assets successfully synchronized into public folder.");
  } else {
    console.warn("PWA source cross image not found at:", crossSource);
  }
} catch (error) {
  console.error("Error creating PWA static logos:", error);
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK with User-Agent header for AI Studio build telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Endpoint to generate a beautiful, themed devotional
app.post("/api/devotional", async (req, res) => {
  const { theme } = req.body;
  const selectedTheme = theme || "Paz Interior y Confianza";

  try {
    const prompt = `Genera un devocional cristiano inspirador para el día de hoy sobre el tema: "${selectedTheme}".
Proporciona un título hermoso, un versículo de la Biblia en español (Reina Valera 1960), la referencia exacta de ese versículo, una reflexión profunda y reconfortante orientada al tema, una oración sincera para guiar al creyente en el día, y un "paso práctico" (acción de fe) para vivir la Palabra hoy. Asegúrate de que el tono sea humilde, reconfortante, pastoral y lleno de amor y esperanza.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Un título inspirador para el devocional",
            },
            verse: {
              type: Type.STRING,
              description: "El versículo bíblico citado completo en español",
            },
            verseReference: {
              type: Type.STRING,
              description: "La cita o referencia bíblica (ej. Filipenses 4:6-7)",
            },
            reflection: {
              type: Type.STRING,
              description: "Una reflexión cálida, profunda y alentadora de 2 o 3 párrafos",
            },
            prayer: {
              type: Type.STRING,
              description: "Una oración escrita en primera persona para que el usuario la haga suya",
            },
            actionStep: {
              type: Type.STRING,
              description: "Un paso o acción de fe práctica para poner en acción hoy",
            },
          },
          required: ["title", "verse", "verseReference", "reflection", "prayer", "actionStep"],
        },
      },
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("No se pudo obtener el texto del modelo de IA.");
    }

    const devotionalData = JSON.parse(textOutput.trim());
    return res.json({ success: true, data: devotionalData });
  } catch (error: any) {
    console.error("Error generating devotional:", error);
    return res.status(500).json({
      success: false,
      message: "Error al generar el devocional. Inténtelo más tarde.",
      error: error.message,
    });
  }
});

// Endpoint to generate a personalized prayer / letter of encouragement for a user request
app.post("/api/encourage-prayer", async (req, res) => {
  const { name, request, category } = req.body;

  if (!request) {
    return res.status(400).json({ success: false, message: "La petición de oración es obligatoria." });
  }

  const petitionerName = name || "Hermano(a) en la fe";

  try {
    const prompt = `Como consejero de Radio Alfa, escribe un mensaje de aliento espiritual de 2 o 3 párrafos y una oración bíblica detallada para una persona llamada "${petitionerName}" que ha compartido la siguiente petición de oración en la categoría "${category || "Fe"}":

"${request}"

El mensaje debe ser lleno de empatía cristiana, citar un versículo pertinente para confortarles, y concluir con una oración guiada dulce, sincera y poderosa que toque sus corazones directa y respetuosamente. Estilo pastoral, compasivo y esperanzador.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            encouragement: {
              type: Type.STRING,
              description: "Mensaje cálido y de aliento de 1 o 2 párrafos enfocado en su situación",
            },
            biblicalPromise: {
              type: Type.STRING,
              description: "Un pasaje de ánimo relevante (ej: 'El Señor es mi pastor; nada me faltará.')",
            },
            promiseReference: {
              type: Type.STRING,
              description: "La referencia bíblica exacta (ej: Salmos 23:1)",
            },
            guidedPrayer: {
              type: Type.STRING,
              description: "Una oración dedicada de amor e intercesión poderosa para que ore hoy",
            },
          },
          required: ["encouragement", "biblicalPromise", "promiseReference", "guidedPrayer"],
        },
      },
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("No se pudo obtener respuesta del modelo para la oración de aliento.");
    }

    const prayerResponse = JSON.parse(textOutput.trim());
    return res.json({ success: true, data: prayerResponse });
  } catch (error: any) {
    console.error("Error generating encouraging prayer:", error);
    return res.status(500).json({
      success: false,
      message: "No pudimos generar la carta de oración en este momento.",
      error: error.message,
    });
  }
});

// Start express server and hook Vite as a middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Radio Alfa Live server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
