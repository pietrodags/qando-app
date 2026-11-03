// Stylesheets imported as text with `with { loader: 'text' }` (design-token tests).
declare module '*.scss' {
  const content: string;
  export default content;
}
