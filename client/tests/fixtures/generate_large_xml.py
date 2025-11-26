#!/usr/bin/env python3
"""Generate a large MPC XML file with 150 cards for performance testing."""

# Sample card data - we'll rotate through these
CARD_NAMES = [
    ("Abrupt Decay", "abrupt decay", "1L56-vQ08leCTGu7orNMlWYKiXqWAnTiO"),
    ("Ashnod's Altar", "ashnods altar", "1CFKGITXtJgJt47dEKTfJLrvAq6Ghi3JK"),
    ("Birds of Paradise", "birds of paradise", "1ABC123XYZ456DEF789GHI012JKL345MN"),
    ("Lightning Bolt", "lightning bolt", "1MNO678PQR901STU234VWX567YZA890BC"),
    ("Sol Ring", "sol ring", "1DEF234GHI567JKL890MNO123PQR456ST"),
    ("Llanowar Elves", "llanowar elves", "1UVW789XYZ012ABC345DEF678GHI901JK"),
    ("Counterspell", "counterspell", "1LMN234OPQ567RST890UVW123XYZ456AB"),
    ("Dark Ritual", "dark ritual", "1CDE789FGH012IJK345LMN678OPQ901RS"),
    ("Swords to Plowshares", "swords to plowshares", "1TUV234WXY567ZAB890CDE123FGH456IJ"),
    ("Path to Exile", "path to exile", "1KLM789NOP012QRS345TUV678WXY901ZA"),
]

def generate_xml(num_cards=150):
    """Generate MPC XML with specified number of cards."""
    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<order>',
        '    <details>',
        '        <quantity>10</quantity>',
        '        <bracket>18</bracket>',
        '        <stock>(S30) Standard Smooth</stock>',
        '        <foil>false</foil>',
        '    </details>',
        '    <fronts>',
    ]
    
    # Generate card entries
    for i in range(num_cards):
        card_data = CARD_NAMES[i % len(CARD_NAMES)]
        name, query, card_id = card_data
        
        # Modify ID to make it unique
        unique_id = f"{card_id[:-4]}{i:04d}"
        unique_name = f"{name} ({i+1}).jpg"
        
        xml_lines.extend([
            '        <card>',
            f'            <id>{unique_id}</id>',
            f'            <slots>{i}</slots>',
            f'            <name>{unique_name}</name>',
            f'            <query>{query}</query>',
            '        </card>',
        ])
    
    xml_lines.extend([
        '    </fronts>',
        '    <cardback>1LrVX0pUcye9n_0RtaDNVl2xPrQgn7CYf</cardback>',
        '</order>',
        ''
    ])
    
    return '\n'.join(xml_lines)

if __name__ == '__main__':
    import sys
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    xml_content = generate_xml(count)
    output_file = f'mpc-{count}-cards.xml'
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(xml_content)
    
    print(f"Generated {output_file} with {count} cards")
