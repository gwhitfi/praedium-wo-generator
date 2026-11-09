import FavoriteToggle from "./FavoriteToggle";
import { Favorite } from "./list/List";

// A record's name with its favorite star. The star is kept on the same line as the last word, so it never wraps
// onto a line of its own. Archived records show the star without the button.
export default function TitleWithFavorite({
    name,
    favorite,
    archived,
    onToggle,
}: {
    name: string;
    favorite: boolean;
    archived: boolean;
    onToggle: () => Promise<void>;
}): React.ReactElement {
    const words = name.trim().split(/\s+/);
    const last = words.pop() ?? "";

    return (
        <>
            {words.length > 0 && `${words.join(" ")} `}
            <span className="whitespace-nowrap">
                {last}
                {archived ? <Favorite show={favorite} /> : <FavoriteToggle favorite={favorite} onToggle={onToggle} />}
            </span>
        </>
    );
}
