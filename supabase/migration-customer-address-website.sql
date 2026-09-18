-- A customer's street address and website.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- customer_profiles is the local overlay on a RingLogix account (there is no
-- local customer record, they're fetched live), so these two sit beside the
-- ISP fields rather than in a table of their own.
--
-- The values come from a researched list of the 162 open accounts,
-- 149 of which had something on file. Where an address or a site
-- wasn't known the column is left NULL rather than carrying a note like "not
-- confirmed": the field should read as empty, not as an explanation.

alter table customer_profiles add column if not exists address text;
alter table customer_profiles add column if not exists website text;

-- One row per customer, keyed by the RingLogix domain id. COALESCE on the
-- update so re-running can't blank a value someone has since typed in by
-- hand, and so an address already on file wins over a blank here.
insert into customer_profiles (customer_id, address, website)
values
  ('292730', '6123 Inez St, Suite 6, Ventura, CA 93003', null),  -- A & S Fire Protection
  ('292332', '838 E. Front St, Ventura, CA 93001', 'aegroupme.com'),  -- AE Group Mechanical Engineers
  ('290907', '201 Kinetic Drive, Oxnard, CA 93030', 'agromin.com'),  -- Agromin-Oxnard
  ('294636', '1641 Mountain View Ave, Oxnard, CA', 'agromin.com'),  -- Agromin-Oxnard-Mountain View Lane
  ('294822', 'Edwards Ranch Rd (off Hwy 126), Santa Paula, CA 93060', 'agromin.com'),  -- Agromin-Santa Paula
  ('293109', '131 Mallard Way, Oxnard, CA 93030', 'allamericanroofing.com'),  -- All American Roofing
  ('293821', '101 W Short St, Oak View, CA 93022', 'americanhay.net'),  -- American Hay
  ('278116', '8055 W Manchester Ave, Ste 735, Playa del Rey, CA 90293', null),  -- Arrive Home Lending, INC
  ('278474', '1760 E Lemonwood Dr, Santa Paula, CA 93060', null),  -- Automotive Racing Products, Inc-Lemonwood
  ('277516', '698 Mobil Ave, Camarillo, CA 93010', null),  -- B & B Do It Center waynelynn do it ctr
  ('288843', '4054 Transport St, Suite A, Ventura, CA 93003', 'abplace.com'),  -- B & B Electric Sales
  ('287422', '1580 Saratoga Ave, Suite D, Ventura, CA 93003', null),  -- B & L Plumbing
  ('290099', '2472 Eastman Ave, Suite 20, Ventura, CA 93003', null),  -- BC Industrial Services LLC
  ('291012', '2473 Camino Del Sol, Oxnard, CA 93030', null),  -- Beardsley and Son, LLC.
  ('277208', '4747 McGrath St, Ventura, CA 93003', 'bellspowdercoating.com'),  -- Bell Powder Coating
  ('283871', '1855 E Main St, Ventura, CA 93001', 'thebenchwarmerventura.com'),  -- Bench Warmer
  ('278291', '83 E Daily Dr, Camarillo, CA 93010', 'breadbasketcake.com'),  -- Bread Basket Cake Company
  ('294144', '5501 Elizabeth Rd, Ventura, CA 93004', 'brokawnursery.com'),  -- Brokaw Nursery
  ('291128', '748 W Rancho Vista Blvd, Suite E, Palmdale, CA 93551', 'slicehouse.com'),  -- CALI PIZZA LLC DBA Slice House Palmdale
  ('293993', '2463 E Main St, Ventura, CA 93003', 'caloakspm.com'),  -- California Oaks Property Management
  ('277511', '2310 E Ponderosa Dr, Ste 6, Camarillo, CA 93010', 'camarillotravel.com'),  -- Camarillo Travel
  ('291604', '354 Autumn Path Lane, Santa Paula, CA 93060', null),  -- Carreon Funding Solutions
  ('283514', '2150 Anchor Court, Newbury Park, CA 91320', null),  -- Century Electronics
  ('289104', '353 Santa Monica Drive, Channel Islands Beach, CA 93035', 'cibcsd.com'),  -- Channel Islands Beach CSD
  ('279617', '1482 Callens Rd, Ventura, CA 93003', null),  -- Channel Islands Floor Coverings
  ('289850', null, 'channelislandsflowers.com'),  -- Channel Islands Flowers Office - Ventura
  ('288801', '3900 Bluefin Circle, Oxnard, CA 93035', null),  -- Channel Islands Maritime Museum
  ('282665', '230 Dove Ct, Santa Paula, CA 93060', null),  -- Clark Engineering Construction
  ('293176', '888 W Ventura Blvd, Suite C, Camarillo, CA 93010', 'concordconsulting.net'),  -- Concord Consulting
  ('288175', '924 E. Third Street, Oxnard, CA 93030', 'delmarseafoods.com'),  -- Del Mar Seafoods, Inc.
  ('292277', '4568 Clubhouse Drive, Somis, CA 93066', null),  -- Diane & David Grimes Surveying
  ('277627', '3111 E Main St, Ste A, Ventura, CA 93003', null),  -- Dikes Thornton Automotive
  ('287399', '2807 Loma Vista Rd, Ste 101, Ventura, CA 93003', null),  -- Dr. Emery, M.D
  ('290151', '2580 E Main St, Suite 205, Ventura, CA 93003', 'dynamicflowpt.com'),  -- Dynamic Flow Physical Therapy
  ('279635', '3160 Telegraph Road, Suite 206, Ventura, CA 93003', null),  -- EBS Executive Business Services, LLC
  ('282777', '200 Lambert St, Suite A, Oxnard, CA 93036', 'famconpipe.com'),  -- Famcon Pipe & Supply, Inc
  ('293632', '1580 Saratoga Ave, Unit C, Ventura, CA 93003', 'fireflyceramics.com'),  -- Firefly Ceramics
  ('294717', '121 Davis St, Santa Paula, CA 93060', 'sppresby.com'),  -- First Presbyterian Church Santa Paula
  ('291338', '1026 E Main St, Santa Paula, CA 93060', null),  -- Franks Paint & Hardware
  ('287258', '545 N Ventura Ave, Oak View, CA 93022', null),  -- Freds Tire Man - Ojai
  ('294502', '1656 Walter St, Suite E, Ventura, CA 93003', null),  -- Fritts Roofing and Repair
  ('279159', '100 Rancho Rd, Ste 1, Westlake Village, CA 91362', null),  -- George Piper Insurance Services, Inc
  ('277358', '1233 S Wells Rd, Ste B, Ventura, CA 93004', null),  -- Golden State Flowers, INC
  ('293346', '1580 Saratoga Ave, Ste A, Ventura, CA 93003', null),  -- Goliger Leather Co Inc
  ('285111', '7659 Topanga Canyon Blvd, Canoga Park, CA 91304', 'greenthumb.com'),  -- Green Thumb - Growing Grounds
  ('281544', '1899 S Victoria Ave, Ventura, CA 93003', 'greenthumb.com'),  -- Green Thumb International - Ventura
  ('279551', '21812 Sherman Way, Canoga Park, CA 91303', 'greenthumb.com'),  -- Green Thumb International Canoga Park
  ('294632', '23782 Bridger Rd, Lake Forest, CA 92630', 'greenthumb.com'),  -- Green Thumb Lake Forest
  ('293321', '1019 W San Marcos Blvd, San Marcos, CA 92078', 'greenthumb.com'),  -- Green Thumb Nursery San Marcos
  ('289241', '23734 Newhall Ave, Santa Clarita, CA 91321', 'greenthumb.com'),  -- Green Thumb Nursery Santa Clarita
  ('291854', '5720 Nicolle Street, Ventura, CA 93003', 'gearkeeper.com'),  -- Hammerhead Industries, Inc
  ('292886', '3165 Harbor Blvd, Oxnard, CA 93035', 'harborwalkhoa.com'),  -- HARBORWALK OWNERS ASSOC.
  ('284815', '1811 Knoll Dr, Suite A, Ventura, CA 93003', null),  -- Hishmeh Enterprises Dominos-Corporate
  ('293251', '4744-1B Telephone Rd, Ventura, CA 93003', 'hotworx.net'),  -- Hotworx
  ('277215', '1445 Donlon St, Suite 14, Ventura, CA 93003', 'atlantisutility.com'),  -- HQ Atlantis Utility Inc.
  ('284621', '747 West Channel Islands Blvd, Port Hueneme, CA 93041', 'ihop.com'),  -- IHOP Channel Islands - #3458
  ('284879', '718 W Ventura St, Fillmore, CA 93015', 'ihop.com'),  -- IHOP Fillmore 769
  ('286458', '7127 Hollister Ave, Ste 30, Goleta, CA 93117', 'ihop.com'),  -- IHOP Goleta #3754
  ('284623', '1931 N Oxnard Blvd, Oxnard, CA 93036', 'ihop.com'),  -- IHOP Oxnard #746
  ('286457', '202 Nicholson Ave, Santa Maria, CA 93454', 'ihop.com'),  -- IHOP Restaurant #758 Santa Maria
  ('284075', '1771 S Victoria Ave, Ventura, CA 93003', 'ihop.com'),  -- IHOP Ventura - 766
  ('290513', '1691 Spinnaker Dr, #105B, Ventura, CA 93001', 'islandpackers.com'),  -- Island Packers
  ('281101', '4951 Olivas Park Drive, Ventura, CA 93003', 'jhbiotech.com'),  -- JH Biotech INC
  ('277379', '2810 W Wooley Rd, Oxnard, CA 93035', null),  -- JN Designs
  ('290517', '2772 Johnson Dr, Ventura, CA 93003', null),  -- Kids and Parents Medical Center
  ('293615', '301 Kinetic Dr, Oxnard, CA 93030', null),  -- Kinetic Stone
  ('285142', '3885 Peachy Canyon Road, Paso Robles, CA 93446', 'lawestatewines.com'),  -- Law Estate Wines
  ('284546', '4755 E Los Angeles Ave, Somis, CA 93066', null),  -- LBL Equipment Repair INC
  ('291314', '12484 W Telegraph Rd, Santa Paula, CA 93060', null),  -- Leavens Ranches LLC
  ('286235', '1070 N Ventura Ave, Ventura, CA 93001', null),  -- Magnum Fence and Security
  ('281321', '5124 Ralston St, Ventura, CA 93003', null),  -- Mail Manager, INC
  ('288457', '2895 Loma Vista Rd, Ste E, Ventura, CA 93003', null),  -- Margaret A Peterson MD
  ('284775', '2930 Los Olivos, Oxnard, CA 93036', null),  -- Mayan Hardwood, INC
  ('291164', '710 S Fairview Ave, Goleta, CA 93117', null),  -- Mission Ready Mix
  ('285265', '711 E Daily Dr, Suite 120, Camarillo, CA 93010', 'mwb.org'),  -- Mission Without Borders
  ('291047', '1280 S. Victoria Ave, Ventura, CA 93003', null),  -- Montalvo Center LLC
  ('289786', '5500 Telegraph Rd, Ste 201, Ventura, CA 93003', null),  -- Nathan Shapiro D.M.D
  ('294533', '5700 Moon Dr, Ventura, CA 93003', null),  -- Nielsen, Peterson & Nielsen LLP
  ('289989', '30769 San Francisquito Canyon Rd, Santa Clarita, CA 91390', null),  -- North Hollywood Sportsmens Club
  ('281213', '4542 Las Posas Rd, Ste E, Camarillo, CA 93010', null),  -- Ocean Orthopedic Surgery - Camarillo
  ('290765', '2894 Bunsen Ave, Unit B, Ventura, CA 93003', null),  -- Ocean Pride Seafood INC
  ('277373', '3315 Mendocino Place, Oxnard, CA 93033', null),  -- Paseo Flowers
  ('279991', '1299 S Wells Rd, Ventura, CA 93004', null),  -- Patina Old World Flooring
  ('278275', '201 Bernoulli Cir, Suite D, Oxnard, CA 93030', null),  -- Patriot Air Systems
  ('277480', '715 W Ventura Blvd, Ste A, Camarillo, CA 93010', null),  -- Paul & Gilberts Kitchen
  ('289458', '444 E Santa Clara St, Ventura, CA 93001', 'pizzamandans.com'),  -- Pizza Man Dan Call Center
  ('290872', '550 Collection Blvd, #110, Oxnard, CA 93036', 'pizzamandans.com'),  -- Pizza Man Dans Annex Store #25
  ('291618', null, 'pizzamandans.com'),  -- Pizza Man Dans Camarillo Store 62
  ('290874', '699 Linden Ave, Carpinteria, CA 93013', 'pizzamandans.com'),  -- Pizza Man Dans Carpinteria Store #29
  ('290871', '450 S Victoria Ave, Oxnard, CA 93030', 'pizzamandans.com'),  -- Pizza Man Dans Oxnard 5th Store #22
  ('290744', '444 E Santa Clara St, Ventura, CA 93001', 'pizzamandans.com'),  -- Pizza Man Dans Santa Clara Store #23
  ('291643', '932 E Main St, Santa Paula, CA 93060', 'pizzamandans.com'),  -- Pizza Man Dans Santa Paula Store #26
  ('291642', '1413 S Victoria Ave, Ste H, Ventura, CA 93003', 'pizzamandans.com'),  -- Pizza Man Dans Victoria Store #21
  ('291834', '809 Calle Plano, Camarillo, CA 93012', 'upipanels.com'),  -- PJLCM444LLC DBA UPI Panels
  ('284060', '154 S Las Posas Rd, Camarillo, CA 93010', null),  -- Pleasant Valley County Water District
  ('287301', '5770 Nicolle St, Ventura, CA 93003', null),  -- Quality Upholstery
  ('284898', '1315 E Main St, Santa Paula, CA 93060', null),  -- R & R Pipeline INC
  ('292576', '637 Aliso St, Ventura, CA 93001', null),  -- Real Estate by Norm
  ('277749', '451 W. Gonzales Rd, Ste 230, Oxnard, CA 93036', null),  -- Rose Avenue Family Medical Group
  ('287930', '3167 Telegraph Rd, Ventura, CA 93003', 'sbhsvta.org'),  -- Saint Bonaventure High School
  ('277514', '5777 Valentine Rd, Ventura, CA 93003', null),  -- Salzers Records
  ('292226', '1947 E Main St, Ventura, CA 93001', null),  -- Santa Cruz Market
  ('279993', '1735 Pancho Rd, Camarillo, CA 93010', null),  -- Showscapes-Treescapes
  ('289271', '108 E Palm Ave, Burbank, CA 91502', 'slicehouse.com'),  -- Slice House Burbank
  ('292541', '10030 Universal Hollywood Drive, Ste 136, Universal City, CA 91608', 'slicehouse.com'),  -- Slice House City Walk -Margiotta
  ('293929', '19711 Rinaldi St, Porter Ranch, CA 91326', 'slicehouse.com'),  -- Slice House Porter Ranch
  ('290916', '24250 Town Center Dr, Ste 190, Santa Clarita, CA 91355', 'slicehouse.com'),  -- Slice House Santa Clarita
  ('288443', '2916 Tapo Canyon Rd, Ste B, Simi Valley, CA 93063', 'slicehouse.com'),  -- Slice House Simi Valley-Margiotta
  ('284505', '3297 E Thousand Oaks Blvd, Thousand Oaks, CA 91362', 'slicehouse.com'),  -- Slice House Thousand Oaks-Margiotta
  ('289238', '1500 Mt Diablo Blvd, Walnut Creek, CA 94596', 'slicehouse.com'),  -- Slice House Walnut Creek
  ('294129', '63 N Ash St, Ventura, CA 93001', 'smithhobson.com'),  -- Smith-Hobson-Aliso Ranch Stables
  ('284575', '63 N Ash St, Ventura, CA 93001', 'smithhobson.com'),  -- Smith-Hobson, LLC
  ('284958', '4850 Verdugo Way, Ste A, Camarillo, CA 93011', 'snapperjackstacoshack.com'),  -- Snapper Jacks Taco Shack - Camarillo
  ('284701', '533 E Main St, Ventura, CA 93001', 'snapperjackstacoshack.com'),  -- Snapper Jacks Taco Shack - Ventura
  ('290713', '3151 W 5th St, Suite G, Oxnard, CA 93030', 'specialty-marine.com'),  -- Specialty Marine
  ('288025', '1259 Callens Rd, Suite A, Ventura, CA 93003', 'spectrumprops.com'),  -- Spectrum Property Services
  ('291696', '3151 W 5th St, Ste C, Oxnard, CA 93030', null),  -- Steve's Grocery Distributing
  ('288515', '1545 Morse Ave, Suite A, Ventura, CA 93003', 'sunsetdentalventura.com'),  -- Sunset Dental
  ('282862', '1891 Goodyear Ave, #603, Ventura, CA 93003', 'tarcotools.com'),  -- Tarco Industries Inc
  ('287146', '1583 Spinnaker Dr, Ste 101, Ventura, CA 93001', 'thegreekventura.com'),  -- The Greek Mediterranean Steak & Seafood
  ('289871', '1450 South Rose Avenue, Oxnard, CA 93033', 'gabriels-house.org'),  -- The Kingdom Center Oxnard Gabriels House
  ('289787', '889 E Santa Clara St, Ventura, CA 93001', 'therivercommunity.org'),  -- The River Community Church Ventura, Inc
  ('288447', '980 E Front St, Ventura, CA 93001', null),  -- The Wharf
  ('292528', '899 Mission Rock Rd, Santa Paula, CA 93060', 'thompco.com'),  -- Thompco
  ('285976', '621 Via Alondra, Suite 601, Camarillo, CA 93012', 'toldcorporation.com'),  -- TOLD Corporation
  ('288696', null, 'malibutree.com'),  -- Tree&Landscape Malibutree.com
  ('277210', '1620 Mesa Verde Ave, Ste C, Ventura, CA 93003', 'stevensons.com'),  -- Tri County Restaurant Supply Stevensons
  ('288353', '401 N. Lombard St, Ste E, Oxnard, CA 93030', 'ulcs.com'),  -- Ultralight Camera Solutions
  ('278490', '1399 Arundell Ave, Ventura, CA 93003', null),  -- Union Engineering Company, Inc.
  ('279179', '11059 Azahar St, Ventura, CA 93004', null),  -- Unit II, INC
  ('284721', '106 N 8th St, Santa Paula, CA 93060', 'unitedwater.org'),  -- United Water Conservation District
  ('289408', '6085 King Drive, Unit 104, Ventura, CA 93003', 'vacumed.com'),  -- Vacumetrics, Inc
  ('277387', '181 S Ash St, Ventura, CA 93001', 'vtb-cpas.com'),  -- Vance, Thrift & Biller
  ('285396', '1649 Palma Dr, Unit A, Ventura, CA 93003', null),  -- Ventura Auto Body and Collision
  ('292992', '38 Teloma Dr, Ventura, CA 93003', 'venturacountychristian.com'),  -- Ventura County Christian School
  ('284471', '1601 Callens Rd, Ventura, CA 93003', 'venturarental.com'),  -- Ventura Rentals, INC
  ('289377', '1755 Spinnaker Drive, Ventura, CA 93001', 'venturayachtclub.org'),  -- Ventura Yacht Club
  ('283715', '1864 Goodyear Ave, Ventura, CA 93003', 'vicssupply.com'),  -- Vics Plumbing Supply, INC
  ('281668', '5850 Thille St, Ste 101, Ventura, CA 93003', 'venturawellspring.com'),  -- Wellspring Family Medical Group
  ('285177', '561 Kinetic Dr, Ste A, Oxnard, CA 93030', null),  -- West Coast Air Conditioning - GMH Inc
  ('289784', '1922 Palma Drive, Ste A, Ventura, CA 93003', 'wcsd1.com'),  -- West Coast Sash & Door
  ('277351', '1901 Solar Drive, Suite 105, Oxnard, CA 93036', 'wvcba.org'),  -- West Ventura County Business Alliance
  ('288649', '1336 N Moorpark Rd, #226, Thousand Oaks, CA 91360', null),  -- Window Design Group-Covered Glass, Inc
  ('280756', '5917 Olivas Park Dr, Ste F, Ventura, CA 93003', null),  -- WPM DBA Arjays Window Fashions
  ('281357', '86 E Daily Dr, Camarillo, CA 93010', 'yolandasmexicancafe.com'),  -- Yolanda's Mexican Cafe - Camarillo
  ('281358', '1601 S Victoria Ave, Ste 190, Oxnard, CA 93033', 'yolandasmexicancafe.com'),  -- Yolanda's Mexican Cafe - Oxnard
  ('287635', '590 E Los Angeles Ave, Simi Valley, CA 93065', 'yolandasmexicancafe.com'),  -- Yolanda's Mexican Cafe - Simi Valley
  ('283893', '2753 E Main St, Ventura, CA 93003', 'yolandasmexicancafe.com'),  -- Yolanda's Mexican Cafe - Ventura
  ('281359', null, 'yolandasmexicancafe.com')  -- Yolanda's Mexican Cafe Corporate Office
on conflict (customer_id) do update
   set address = coalesce(excluded.address, customer_profiles.address),
       website = coalesce(excluded.website, customer_profiles.website),
       updated_at = now();
