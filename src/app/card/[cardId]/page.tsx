import { CardView } from "@/components/card/CardView";

type PageProps = { params: Promise<{ cardId: string }> };

export default async function CardPage({ params }: PageProps) {
    const { cardId } = await params;
    return <CardView cardId={cardId} />;
}
