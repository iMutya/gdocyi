const markers = Array.from({ length: 83 }, (_, i) => i);

export const Ruler = () => {
    return (
        <div className="h-6 border-b border-gray-300 flex items-end relative select-none print:hidden">
            <div
                id="ruler-container"
                className="max-w-[816px] mx-auto w-full h-full relative"
            >
                <div className="absolute inset-x-0 bottom-0 h-full">
                    <div className="relative h-full w-[816px]">
                      {markers.map((marker) => {
                        const position = (marker * 816 ) / 82;

                        return(
                            <div 
                            key={marker}
                            >

                            </div>
                        )
                      })} 
                    </div>
                </div>
            </div>
        </div>
    )
}