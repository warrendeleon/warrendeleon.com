---
title: "Cómo escribir una prueba técnica para casa que los candidatos realmente quieran hacer"
description: "La mayoría de las pruebas técnicas fallan por fricción en el setup, briefs vagos o no respetar el tiempo del candidato. Así diseñé una por la que dan las gracias."
tags: ["engineering-management", "hiring", "tech-interviews", "developer-experience"]
locale: es
heroImage: "/images/blog/take-home-tech-test-design.webp"
heroAlt: "Diseñando una prueba técnica para casa para ingenieros de software"
campaign: "take-home-tech-test"
relatedPosts: ["why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-to-pass-a-react-native-tech-test", "how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior"]
---

## La prueba que nadie termina

La mayoría de las pruebas técnicas fallan antes de que el candidato escriba una sola línea de código.

Clonan el repo. Ejecutan `npm install`. Algo se rompe. Cuarenta y cinco minutos después están debuggeando un mismatch de versión de Ruby, un CocoaPod que falta o una versión de Node que no se lleva con el bundler. Para cuando la app arranca, ya quemaron su paciencia y la mitad de su noche.

Los mejores candidatos, los que realmente quieres contratar, son los que más probabilidades tienen de irse. Tienen opciones. Van a elegir la empresa que respete su tiempo.

La versión clásica del take-home tiene su lógica. Un brief prescriptivo con un stack fijo te da entregas comparables entre candidatos, y la fricción del setup filtra por aguante. Si contratas en volumen para un rol estrecho, esa señal sirve. Para un equipo pequeño que contrata a varios niveles, donde dos seniors van a tirar por librerías de estado distintas el día uno, estás filtrando por lo que no toca.

Nuestro primer candidato con la prueba vieja lo dejó claro. Dos horas peleando con versiones de Ruby antes de escribir una línea de código de aplicación. El Ruby equivocado en cada paso: el del sistema, demasiado viejo; el de brew, demasiado nuevo para el bundler vendorizado. Mensajes de ida y vuelta todo el rato. Cero líneas de código al final.

Las preguntas estaban bien. La experiencia de desarrollo era el problema.

## Trata la prueba como un producto

La prueba técnica es la primera interacción real que un candidato tiene con tu cultura de ingeniería. Todo lo que toca le dice algo sobre ti.

Si el setup está roto, piensan que tu codebase está roto.
Si el enunciado es vago, piensan que tus specs son vagas.
Si el timeline es irreal, piensan que tus deadlines son irreales.

Así que trato la prueba de la misma forma que trataría un producto:

| Pensamiento de producto | Aplicado a la prueba técnica |
|---|---|
| Investigación de usuarios | ¿Qué frustra a los candidatos de las pruebas técnicas? |
| Requisitos claros | Un brief detallado con wireframes y reglas |
| Experiencia de desarrollo | Proyecto starter, script de setup, path aliases |
| Documentación | Guías enlazadas para cada pregunta que puedan tener |
| Mejora continua | Actualizar después de cada ronda según lo que salió mal |

Después del incidente con Ruby añadí un script de setup, fijé la versión de Ruby, commiteé un Gemfile.lock con un bundler moderno y añadí una sección de troubleshooting al README. El siguiente candidato estaba codeando en menos de dos minutos.

## El script de setup

La mejora más grande fue un `setup.sh` que se encarga de todo.

```bash
./setup.sh
```

Un solo comando. Lo que hace:

- Comprueba la versión de Node (ofrece instalarla via nvm)
- Comprueba la versión de Ruby (soporta rbenv, rvm y asdf)
- Comprueba Xcode CLI tools y CocoaPods
- Ejecuta `yarn install`
- Ejecuta `bundle install` y `pod install`
- Te dice exactamente qué arreglar si algo falla

Una salvedad honesta: este flujo asume un Mac, porque el brief pide ejecutar en iOS. Un candidato sin Mac necesita el camino de Android bien explicado, así que el README documenta `yarn android` como alternativa de primera clase y ningún requisito menciona un simulador por su nombre.

La decisión de diseño clave: el script pregunta antes de instalar cualquier cosa. Detecta lo que el candidato ya tiene y trabaja con eso. Quien usa rbenv recibe rbenv. Quien usa rvm recibe rvm. Su entorno se respeta, no se sobreescribe.

Fija las versiones en el repo. `.ruby-version`, `.nvmrc`, `Gemfile.lock` con un bundler moderno. Después escribe un script de setup que las lea. Cada minuto que un candidato pasa en el setup es un minuto que no está escribiendo código.

## El proyecto starter

Le doy a los candidatos un proyecto completamente configurado. No un repo vacío. Una app funcionando.

| Incluido | Por qué |
|---|---|
| TypeScript en modo estricto | Sin ambigüedad sobre las expectativas del lenguaje |
| React Navigation v7 con params tipados | La navegación es boilerplate, no una prueba de habilidad |
| Jest + React Native Testing Library | Configurado con mocks de módulos nativos, listo para escribir tests |
| ESLint + Prettier | Estilo de código consistente desde la primera línea |
| Path aliases (`@app/*`) | Nada de cadenas de imports `../../../` |
| Wrapper de render custom para tests | NavigationContainer incluido, solo renderiza y haz assert |
| Tres pantallas placeholder | "Replace me": punto de partida claro |
| Un smoke test que pasa | Prueba de que el setup funciona antes de que cambien nada |

Todo compila. Todo funciona. El smoke test pasa.

No estoy evaluando si alguien puede configurar un bundler o debuggear un path alias de TypeScript. Estoy evaluando si pueden construir código de aplicación. El proyecto starter elimina cada obstáculo entre "cloné el repo" y "estoy escribiendo mi primer componente."

Algunos candidatos arrancan de cero igualmente. Está bien, el starter es opcional. La mayoría lo usa, y en vez de pasar su primera hora peleando con configuración, la pasan tomando decisiones de arquitectura.

## El brief: claro en el qué, no en el cómo

Algunas pruebas técnicas especifican exactamente cómo construir las cosas. Qué librería de state management, qué estructura de carpetas, qué cliente de API. Ese enfoque rinde cuando necesitas entregas comparables manzana con manzana, o cuando el rol va de trabajar dentro de convenciones cerradas. Para nosotros, esas decisiones son la parte más interesante de la entrega, así que fijarlas tiraría a la basura la señal que queremos.

Nuestro brief toma el enfoque opuesto. Explica en detalle qué tiene que hacer la app y no dice nada del cómo.

- Wireframes de pantallas muestran los datos y las interacciones (layouts ASCII, no diseños pixel-perfect)
- Una tabla de requisitos detalla las reglas (máximo 6 items, añadir desde el detalle, eliminar desde la lista)
- Una tabla de requisitos técnicos lista los no negociables (React Native, TypeScript, React Navigation)

Lo que falta deliberadamente: prescripciones de arquitectura. El candidato elige el state management, la estructura de carpetas, el cliente de API, la estrategia de testing.

Un candidato que elige Redux Toolkit me dice algo diferente que uno que elige Zustand. Ninguno está mal. Los dos son interesantes. El razonamiento detrás de la elección es sobre lo que se construye la conversación del walkthrough.

Si tu brief especifica la arquitectura, estás evaluando cumplimiento, no ingeniería. Los briefs que funcionan para nosotros describen el qué en detalle y dejan el cómo completamente abierto.

## Respetar el tiempo de la gente

Los candidatos tienen 7 días. El trabajo debería llevar de 4 a 6 horas.

Lo decimos explícitamente, en el brief y en la guía de entrega, dos veces, porque la gente se lo pierde la primera.

7 días da flexibilidad. Algunos trabajan durante un fin de semana. Algunos hacen una hora cada noche. Algunos bloquean un sábado por la mañana. El timeline respeta que los candidatos tienen trabajos, familias y una vida fuera del proceso de entrevistas.

La estimación de 4 a 6 horas es honesta. Yo mismo hice la prueba para verificarlo. Un desarrollador competente de React Native puede construir las tres pantallas con state management, integración de API, tests básicos y un README en ese tiempo. Algunos eligen invertir más. Es su decisión, no nuestra expectativa.

Si un candidato necesita más tiempo, se lo damos. Sin preguntas. Quedarse callado y entregar tres días tarde sin explicación es una señal diferente a mandar un mensaje diciendo "necesito un par de días más." La comunicación importa.

## Diles qué estás buscando

Al principio, un candidato pasó una hora estilizando botones porque había asumido que el pulido visual nos importaba. No era así. Estábamos mirando arquitectura y testing. Esa hora se desperdició por nuestra parte, no la suya, porque no le habíamos dicho qué contaba.

Ahora somos explícitos:

```
Cómo piensas la arquitectura y la organización del código
Cómo descompones un problema en componentes y flujos de datos
Cómo tomas y justificas decisiones técnicas
Cómo manejas casos borde y estados de error
Qué tan bien conoces tu propio código

NO estamos evaluando diseño visual ni UI pixel-perfect
NO esperamos una app production-ready en una prueba para casa
```

Cuando los candidatos saben que nos importa más la arquitectura y los trade-offs que el styling, distribuyen su tiempo acorde. Mejor señal para nosotros, mejor experiencia para ellos.

También les contamos de entrada que podemos usar herramientas automatizadas como pre-check, pero que cada entrega es revisada y puntuada manualmente por el panel de contratación. La transparencia genera confianza.

## El walkthrough es una conversación

El candidato lidera los primeros 10 minutos:

1. Demo de la app. Recorrer todas las pantallas, mostrar las features funcionando.
2. Ejecutar los tests. Mostrarlos pasando en vivo.
3. Recorrer el código. Explicar la estructura y las decisiones.

Después de la presentación, hacemos preguntas. El encuadre importa. Decimos:

> *"No te preocupes si algo no funciona como esperabas durante la demo. Pasa. Si pasa, cuéntame qué piensas que falló y cómo lo arreglarías. Eso me dice más que una demo perfecta."*

El punto es la señal, no la cortesía. Ver a alguien diagnosticar un bug en su propio código es una de las lecturas más fuertes que puedes hacer sobre un ingeniero. Un candidato que dice *"Ah, creo que el dependency array del useEffect está mal aquí"* te está mostrando exactamente cómo trabaja.

Una demo perfecta no te muestra nada excepto que ensayó.

## La documentación como feature de primera clase

La prueba viene con documentación de verdad. No solo un README. Un conjunto de archivos markdown enlazados:

| Documento | Qué cubre |
|---|---|
| Brief de la prueba | Requisitos, wireframes de pantallas, reglas del ejercicio, requisitos técnicos |
| Guía de API | Endpoints, opciones de GraphQL vs REST, recomendaciones de clientes |
| Proyecto Starter | Qué incluye, estructura del proyecto, comandos disponibles, setup de testing |
| Entrega y Walkthrough | Cómo entregar, qué pasa en el walkthrough, tips |
| Stretch Goals | Extras opcionales y qué demuestra cada uno |

Cada pregunta que un candidato pueda tener está respondida antes de que necesite hacerla. El objetivo es sacar la ambigüedad de la ecuación. No quiero evaluar qué tan bien alguien interpreta un brief vago. Quiero evaluar cómo construyen software cuando los requisitos están claros.

## Qué cambiaría la próxima vez

La prueba no está terminada. Esto es lo que tengo en mi lista:

- Un vídeo walkthrough del proyecto starter. Un Loom de 3 minutos mostrando la estructura de carpetas, cómo ejecutarlo y por dónde empezar. Algunas personas aprenden mejor con vídeo que con docs.
- Un archivo `.env.example`. La prueba usa una API pública sin keys, pero commitear el archivo establece el patrón correcto.
- Probar el setup en una máquina limpia antes de cada ronda de contratación. Un portátil de desarrollo acumula años de herramientas, y cualquier suposición de "todos tienen esto instalado" se rompe en cuanto un candidato ejecuta el script en una instalación de SO recién hecha.

La estructura está bien igualmente. Script de setup. Proyecto starter. Brief claro. Timeline honesto. Documentación de verdad. Criterios de evaluación transparentes.

Si estás diseñando una prueba técnica y los candidatos siguen abandonando, no mires las preguntas primero. Mira la experiencia de desarrollo. **La mejor prueba técnica es una donde el candidato pasa el 100% de su tiempo en lo que realmente estás evaluando, y 0% en todo lo demás.**

*Este es el último de los posts sobre el take-home dentro de una serie sobre construir un proceso de contratación desde cero. Los posts anteriores cubren [por qué rediseñé la prueba](/es/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/), [consejos para candidatos que la hacen](/es/blog/how-to-pass-a-react-native-tech-test/) y [cómo funciona la puntuación](/es/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/).*
