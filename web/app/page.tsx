import { redirect } from "next/navigation";

// Default drop ID - redirect homepage to the default drop
const DEFAULT_DROP_ID = "demo-drop-1";

export default function HomePage() {
  redirect(`/drop/${DEFAULT_DROP_ID}`);
}
