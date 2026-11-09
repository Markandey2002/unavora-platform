import { notFound } from "next/navigation";

/** Any unknown public URL under /en or /hi renders the branded, language-aware 404 (with the site header and footer). */
export default function Missing() {
  notFound();
}
