import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Assume process.env.API_KEY is available and configured
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const App = () => {
  const [searchMode, setSearchMode] = useState<'find' | 'explore'>('find');
  
  // --- Find a Flight State ---
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [isRoundTrip, setIsRoundTrip] = useState(true);
  const [summary, setSummary] = useState([]);
  const [weeklyPrices, setWeeklyPrices] = useState([]);
  const [returnWeeklyPrices, setReturnWeeklyPrices] = useState([]);
  
  // Advanced Options State
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabinClass, setCabinClass] = useState('ECONOMY');
  const [stops, setStops] = useState('ANY');
  const [preferredAirlines, setPreferredAirlines] = useState('');

  // --- Explore Destinations State ---
  const [travelPeriod, setTravelPeriod] = useState('');
  const [maxBudget, setMaxBudget] = useState('1000');
  const [interests, setInterests] = useState('');
  const [destinations, setDestinations] = useState([]);

  // --- Shared State ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [departureSuggestions, setDepartureSuggestions] = useState([]);
  const [arrivalSuggestions, setArrivalSuggestions] = useState([]);
  const [activeSuggestionBox, setActiveSuggestionBox] = useState<'departure' | 'arrival' | null>(null);
  const debounceTimeout = useRef(null);

  const fetchAirportSuggestions = async (query, type) => {
    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Full name of the airport." },
          iata: { type: Type.STRING, description: "The 3-letter IATA code of the airport." },
          location: { type: Type.STRING, description: "The city and country of the airport." }
        },
        required: ["name", "iata", "location"]
      }
    };

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide airport suggestions for the query: "${query}". Return a list of up to 5 relevant airports including their name, IATA code, and location.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const suggestions = JSON.parse(response.text);
      if (type === 'departure') {
        setDepartureSuggestions(suggestions);
      } else {
        setArrivalSuggestions(suggestions);
      }
    } catch (e) {
      console.error("Failed to fetch suggestions:", e);
      // Fail silently without showing an error to the user
      setDepartureSuggestions([]);
      setArrivalSuggestions([]);
    }
  };
  
  const handleInputChange = (value, type) => {
    if (type === 'departure') {
      setDeparture(value);
      if (value.length > 2) setActiveSuggestionBox('departure');
      else {
        setActiveSuggestionBox(null);
        setDepartureSuggestions([]);
      }
    } else {
      setArrival(value);
      if (value.length > 2) setActiveSuggestionBox('arrival');
       else {
        setActiveSuggestionBox(null);
        setArrivalSuggestions([]);
      }
    }

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (value.length > 2) {
        debounceTimeout.current = setTimeout(() => {
            fetchAirportSuggestions(value, type);
        }, 150);
    }
  };
  
  const handleSuggestionClick = (suggestion, type) => {
    const suggestionText = `${suggestion.name} (${suggestion.iata})`;
    if (type === 'departure') {
        setDeparture(suggestionText);
        setDepartureSuggestions([]);
    } else {
        setArrival(suggestionText);
        setArrivalSuggestions([]);
    }
    setActiveSuggestionBox(null);
  };
  
  useEffect(() => {
    const handleClickOutside = (event) => {
        if (!event.target.closest('.suggestion-wrapper')) {
            setActiveSuggestionBox(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleModeChange = (mode: 'find' | 'explore') => {
    setSearchMode(mode);
    setError('');
    // Clear all results
    setSummary([]);
    setWeeklyPrices([]);
    setReturnWeeklyPrices([]);
    setDestinations([]);
  };

  const handleFlightSearch = async () => {
    const requiredFields = [departure, arrival, departureDate];
    if (isRoundTrip) {
        requiredFields.push(returnDate);
    }
    if (requiredFields.some(field => !field.trim())) {
      setError('Please fill in all required fields.');
      return;
    }
    
    setLoading(true);
    setError('');
    setSummary([]);
    setWeeklyPrices([]);
    setReturnWeeklyPrices([]);
    setDestinations([]);

    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          departureFlights: {
            type: Type.ARRAY,
            description: "A list of the cheapest departure flights for each day of the week starting from the user's selected departure date.",
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING, description: "Day of the week (e.g., Monday)." },
                date: { type: Type.STRING, description: "The specific date (e.g., 2024-12-25)." },
                airline: { type: Type.STRING, description: "The name of the cheapest airline for that day." },
                price: { type: Type.NUMBER, description: "The estimated lowest price in USD." }
              },
              required: ["day", "date", "airline", "price"]
            }
          },
          returnFlights: {
            type: Type.ARRAY,
            description: "A list of the cheapest return flights for each day of the week starting from the user's selected return date. This array should be empty for one-way trips.",
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING, description: "Day of the week (e.g., Monday)." },
                date: { type: Type.STRING, description: "The specific date (e.g., 2024-12-25)." },
                airline: { type: Type.STRING, description: "The name of the cheapest airline for that day." },
                price: { type: Type.NUMBER, description: "The estimated lowest price in USD." }
              },
              required: ["day", "date", "airline", "price"]
            }
          },
          summary: {
              type: Type.ARRAY,
              description: "A brief summary of findings as a list of bullet points. If a cheaper flight is found in the week before or after the user's selected date range, this MUST be mentioned as a separate point in the list, including the date and price.",
              items: {
                  type: Type.STRING
              }
          }
        },
        required: ["departureFlights", "returnFlights", "summary"]
      };
      
      const buildAdvancedPromptDetails = () => {
        let details = ` for ${adults} adult(s)`;
        if (children > 0) details += `, ${children} child(ren)`;
        if (infants > 0) details += `, and ${infants} infant(s)`;
        details += ` in ${cabinClass.replace('_', ' ')} class.`;

        switch(stops) {
            case 'NON_STOP':
                details += ' The flight must be non-stop.';
                break;
            case 'ONE_STOP':
                details += ' The flight should have at most 1 stop.';
                break;
            case 'TWO_PLUS_STOPS':
                details += ' The flight can have 2 or more stops.';
                break;
            default: // ANY
                details += ' The number of stops does not matter.';
                break;
        }

        if (preferredAirlines.trim()) {
            details += ` Please prioritize the following airlines if possible: ${preferredAirlines}.`;
        }
        return details;
      };

      const advancedDetails = buildAdvancedPromptDetails();
      let prompt;
      if (isRoundTrip) {
          prompt = `Analyze flight prices for a round trip from ${departure} to ${arrival}${advancedDetails} Your primary task is to find the cheapest one-way flight option for each of the 7 days of the week starting from the DEPARTURE date ${departureDate}, and separately, for each of the 7 days of the week starting from the RETURN date ${returnDate}. In parallel, you MUST also search the week immediately BEFORE and immediately AFTER both the departure and return dates to identify any potentially cheaper flights. For the JSON output, populate the 'departureFlights' and 'returnFlights' arrays with the 7-day data for the user's selected weeks. In the 'summary' array, provide a list of bullet points summarizing the findings. You MUST explicitly state as a separate point if a cheaper flight was found in the adjacent weeks, specifying the date and price of that better deal.`;
      } else {
          prompt = `Analyze flight prices for a one-way trip from ${departure} to ${arrival}${advancedDetails} Your primary task is to find the cheapest flight option for each of the 7 days of the week starting from the departure date ${departureDate}. In parallel, you MUST also search the week immediately BEFORE and immediately AFTER the departure date to identify any potentially cheaper flights. For the JSON output, populate the 'departureFlights' array with the 7-day data for the user's selected week. In the 'summary' array, provide a list of bullet points summarizing the findings for the requested week. You MUST explicitly state as a separate point if a cheaper flight was found in the adjacent weeks, specifying the date and price of that better deal.`;
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      try {
        const data = JSON.parse(response.text);
        setSummary(data.summary || []);
        setWeeklyPrices(data.departureFlights || []);
        setReturnWeeklyPrices(data.returnFlights || []);
      } catch (parseError) {
        console.error("Failed to parse JSON response:", parseError, "Response text:", response.text);
        setError("There was an issue processing the flight data. The format was unexpected.");
        setSummary([]);
        setWeeklyPrices([]);
        setReturnWeeklyPrices([]);
      }

    } catch (e) {
      console.error(e);
      setError('Sorry, an error occurred while fetching flight information. Please check your connection or API key and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExploreSearch = async () => {
    if (!departure.trim() || !travelPeriod.trim() || !maxBudget.trim() || !interests.trim()) {
        setError('Please fill in all fields to explore destinations.');
        return;
    }
    setLoading(true);
    setError('');
    setDestinations([]);
    setSummary([]);
    setWeeklyPrices([]);
    setReturnWeeklyPrices([]);

    try {
        const schema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    city: { type: Type.STRING, description: "The name of the suggested city." },
                    country: { type: Type.STRING, description: "The country where the city is located." },
                    description: { type: Type.STRING, description: "A short, compelling description of the destination and why it's a good fit for the user's interests." },
                    estimatedFlightPrice: { type: Type.NUMBER, description: "An estimated round-trip flight price from the user's departure location, in USD." },
                    activities: {
                        type: Type.ARRAY,
                        description: "A list of 3-4 top activities or attractions in the destination.",
                        items: { type: Type.STRING }
                    }
                },
                required: ["city", "country", "description", "estimatedFlightPrice", "activities"]
            }
        };

        const prompt = `I want to travel from ${departure}. I'm thinking of going sometime around ${travelPeriod}. My maximum budget for a round-trip flight is around $${maxBudget}. I'm interested in activities related to: ${interests}. Please suggest 3 to 4 destinations for me. For each destination, provide the city, country, a short, compelling description of why it's a great fit for my interests, an estimated round-trip flight price, and a list of 3 top activities.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: schema,
            },
        });

        try {
            const data = JSON.parse(response.text);
            setDestinations(data || []);
        } catch (parseError) {
            console.error("Failed to parse JSON response:", parseError, "Response text:", response.text);
            setError("There was an issue processing the destination data. The format was unexpected.");
            setDestinations([]);
        }

    } catch (e) {
        console.error(e);
        setError('Sorry, an error occurred while finding destinations. Please check your connection or API key and try again.');
    } finally {
        setLoading(false);
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if(searchMode === 'find' && !isFlightSearchDisabled) handleFlightSearch();
      if(searchMode === 'explore' && !isExploreSearchDisabled) handleExploreSearch();
    }
  };

  const isFlightSearchDisabled = loading || !departure.trim() || !arrival.trim() || !departureDate.trim() || (isRoundTrip && !returnDate.trim());
  const isExploreSearchDisabled = loading || !departure.trim() || !travelPeriod.trim() || !maxBudget.trim() || !interests.trim();

  return (
    <main className="container">
      <header>
        <h1>✈️ Flight Finder & Explorer</h1>
        <p>{searchMode === 'find' ? 'Enter your trip details below to find the best flight deals.' : 'Tell us your travel style and let us find your next adventure.'}</p>
      </header>

      <div className="content-wrapper">
        <div className="search-panel">
            <div className="search-container">
                <div className="mode-toggle">
                    <button onClick={() => handleModeChange('find')} className={searchMode === 'find' ? 'active' : ''} disabled={loading}>Find a Flight</button>
                    <button onClick={() => handleModeChange('explore')} className={searchMode === 'explore' ? 'active' : ''} disabled={loading}>Explore Destinations</button>
                </div>

                {searchMode === 'find' ? (
                    <>
                        <div className="search-grid">
                            <div className="form-group grid-col-span-2">
                                <div className="toggle-group">
                                <input 
                                    type="checkbox"
                                    id="round-trip-toggle"
                                    checked={isRoundTrip}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setIsRoundTrip(checked);
                                        if(!checked) {
                                        setReturnDate('');
                                        }
                                    }}
                                />
                                <label htmlFor="round-trip-toggle">Round-trip</label>
                                </div>
                            </div>

                            <div className="form-group suggestion-wrapper">
                                <label htmlFor="departure-loc">From</label>
                                <input
                                id="departure-loc"
                                type="text"
                                value={departure}
                                onChange={(e) => handleInputChange(e.target.value, 'departure')}
                                onKeyPress={handleKeyPress}
                                placeholder="e.g., New York, USA"
                                aria-label="Departure Location"
                                autoComplete="off"
                                disabled={loading}
                                />
                                {activeSuggestionBox === 'departure' && departureSuggestions.length > 0 && (
                                    <ul className="suggestion-list">
                                        {departureSuggestions.map((s, i) => (
                                            <li key={i} className="suggestion-item" onClick={() => handleSuggestionClick(s, 'departure')}>
                                                <strong>{s.iata}</strong> - {s.name}, {s.location}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="form-group suggestion-wrapper">
                                <label htmlFor="arrival-loc">To</label>
                                <input
                                id="arrival-loc"
                                type="text"
                                value={arrival}
                                onChange={(e) => handleInputChange(e.target.value, 'arrival')}
                                onKeyPress={handleKeyPress}
                                placeholder="e.g., Paris, France"
                                aria-label="Arrival Destination"
                                autoComplete="off"
                                disabled={loading}
                                />
                                {activeSuggestionBox === 'arrival' && arrivalSuggestions.length > 0 && (
                                    <ul className="suggestion-list">
                                        {arrivalSuggestions.map((s, i) => (
                                            <li key={i} className="suggestion-item" onClick={() => handleSuggestionClick(s, 'arrival')}>
                                                <strong>{s.iata}</strong> - {s.name}, {s.location}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="form-group">
                                <label htmlFor="departure-date">Depart</label>
                                <input
                                id="departure-date"
                                type="date"
                                value={departureDate}
                                onChange={(e) => setDepartureDate(e.target.value)}
                                onKeyPress={handleKeyPress}
                                aria-label="Departure Date"
                                disabled={loading}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="return-date">Return</label>
                                <input
                                id="return-date"
                                type="date"
                                value={returnDate}
                                onChange={(e) => setReturnDate(e.target.value)}
                                onKeyPress={handleKeyPress}
                                aria-label="Return Date"
                                disabled={loading || !isRoundTrip}
                                />
                            </div>
                        </div>
                        
                        <div className="advanced-options-container">
                            <div className="advanced-options-toggle">
                                <a href="#" onClick={(e) => { e.preventDefault(); setShowAdvancedOptions(!showAdvancedOptions); }}>
                                    {showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`chevron-icon ${showAdvancedOptions ? 'rotated' : ''}`}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                    </svg>
                                </a>
                            </div>

                            {showAdvancedOptions && (
                                <div className="advanced-options">
                                    <div className="advanced-options-grid">
                                        <div className="form-group traveler-input">
                                            <label htmlFor="adults">Adults</label>
                                            <input id="adults" type="number" min="1" max="9" value={adults} onChange={(e) => setAdults(parseInt(e.target.value, 10))} disabled={loading} />
                                        </div>
                                        <div className="form-group traveler-input">
                                            <label htmlFor="children">Children</label>
                                            <input id="children" type="number" min="0" max="9" value={children} onChange={(e) => setChildren(parseInt(e.target.value, 10))} disabled={loading} />
                                        </div>
                                        <div className="form-group traveler-input">
                                            <label htmlFor="infants">Infants</label>
                                            <input id="infants" type="number" min="0" max="9" value={infants} onChange={(e) => setInfants(parseInt(e.target.value, 10))} disabled={loading} />
                                        </div>
                                        <div className="form-group cabin-class-input">
                                            <label htmlFor="cabin-class">Cabin Class</label>
                                            <select id="cabin-class" value={cabinClass} onChange={(e) => setCabinClass(e.target.value)} disabled={loading}>
                                                <option value="ECONOMY">Economy</option>
                                                <option value="PREMIUM_ECONOMY">Premium Economy</option>
                                                <option value="BUSINESS">Business</option>
                                                <option value="FIRST">First</option>
                                            </select>
                                        </div>
                                        <div className="form-group stops-input">
                                            <label htmlFor="stops">Stops</label>
                                            <select id="stops" value={stops} onChange={(e) => setStops(e.target.value)} disabled={loading}>
                                                <option value="ANY">Any</option>
                                                <option value="NON_STOP">Non-stop</option>
                                                <option value="ONE_STOP">1 Stop</option>
                                                <option value="TWO_PLUS_STOPS">2+ Stops</option>
                                            </select>
                                        </div>
                                        <div className="form-group airlines-input">
                                            <label htmlFor="preferred-airlines">Preferred Airlines (optional)</label>
                                            <input id="preferred-airlines" type="text" value={preferredAirlines} onChange={(e) => setPreferredAirlines(e.target.value)} placeholder="e.g., Delta, United" disabled={loading} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button onClick={handleFlightSearch} disabled={isFlightSearchDisabled} className="search-button">
                        {loading ? 'Searching...' : 'Find Flights'}
                        </button>
                    </>
                ) : (
                    <>
                        <div className="search-grid-explore">
                            <div className="form-group suggestion-wrapper">
                                <label htmlFor="explore-departure-loc">From</label>
                                <input
                                id="explore-departure-loc"
                                type="text"
                                value={departure}
                                onChange={(e) => handleInputChange(e.target.value, 'departure')}
                                onKeyPress={handleKeyPress}
                                placeholder="e.g., New York, USA"
                                aria-label="Departure Location"
                                autoComplete="off"
                                disabled={loading}
                                />
                                {activeSuggestionBox === 'departure' && departureSuggestions.length > 0 && (
                                    <ul className="suggestion-list">
                                        {departureSuggestions.map((s, i) => (
                                            <li key={i} className="suggestion-item" onClick={() => handleSuggestionClick(s, 'departure')}>
                                                <strong>{s.iata}</strong> - {s.name}, {s.location}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="form-group">
                                <label htmlFor="travel-period">Travel Period</label>
                                <input id="travel-period" type="text" value={travelPeriod} onChange={e => setTravelPeriod(e.target.value)} onKeyPress={handleKeyPress} placeholder="e.g., Next Summer, December" disabled={loading}/>
                            </div>
                            <div className="form-group">
                                <label htmlFor="max-budget">Max Budget (USD)</label>
                                <input id="max-budget" type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} onKeyPress={handleKeyPress} placeholder="e.g., 1000" disabled={loading}/>
                            </div>
                            <div className="form-group">
                                <label htmlFor="interests">Interests</label>
                                <input id="interests" type="text" value={interests} onChange={e => setInterests(e.target.value)} onKeyPress={handleKeyPress} placeholder="e.g., beaches, history, food" disabled={loading}/>
                            </div>
                        </div>
                        <button onClick={handleExploreSearch} disabled={isExploreSearchDisabled} className="search-button">
                            {loading ? 'Exploring...' : 'Find Destinations'}
                        </button>
                    </>
                )}
            </div>
        </div>

        {(loading || error || weeklyPrices.length > 0 || destinations.length > 0) && (
            <div className="results-panel">
                {error && <div className="error-message" role="alert">{error}</div>}

                {loading && (
                    <div className="loader-container" aria-live="polite">
                        <div className="loader"></div>
                        <p>{searchMode === 'find' ? 'Scanning the skies for the best deals...' : 'Finding inspiring adventures for you...'}</p>
                    </div>
                )}
                
                {searchMode === 'find' && weeklyPrices.length > 0 && !loading && (
                    <div className="results-wrapper">
                    <section className="results-container" aria-labelledby="results-title">
                        <h2 id="results-title">
                        {isRoundTrip ? 'Cheapest Departure Flights This Week' : 'Cheapest Flights This Week'}
                        </h2>
                        <div className="price-grid">
                            {weeklyPrices.map((flight, index) => (
                            <div key={index} className="price-chip">
                                <div className="price-chip-day">{flight.day}</div>
                                <div className="price-chip-date">{flight.date}</div>
                                <div className="price-chip-price">${flight.price}</div>
                                <div className="price-chip-airline">{flight.airline}</div>
                            </div>
                            ))}
                        </div>
                    </section>

                    {returnWeeklyPrices.length > 0 && (
                        <section className="results-container" aria-labelledby="return-results-title">
                        <h2 id="return-results-title">Cheapest Return Flights This Week</h2>
                        <div className="price-grid">
                            {returnWeeklyPrices.map((flight, index) => (
                                <div key={index} className="price-chip">
                                <div className="price-chip-day">{flight.day}</div>
                                <div className="price-chip-date">{flight.date}</div>
                                <div className="price-chip-price">${flight.price}</div>
                                <div className="price-chip-airline">{flight.airline}</div>
                                </div>
                            ))}
                        </div>
                        </section>
                    )}

                    {summary.length > 0 && (
                        <div className="summary-box" role="status">
                            <div className="summary-box-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="icon">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                                </svg>
                            </div>
                            <div className="summary-box-content">
                                <h4>Smart Savings Tip</h4>
                                <ul>
                                    {summary.map((tip, index) => (
                                        <li key={index}>{tip}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                    </div>
                )}

                {searchMode === 'explore' && destinations.length > 0 && !loading && (
                    <div className="results-wrapper">
                        <section className="results-container" aria-labelledby="destinations-title">
                            <h2 id="destinations-title">Your Next Adventure Awaits...</h2>
                            <div className="destinations-grid">
                                {destinations.map((dest, index) => (
                                    <div key={index} className="destination-card">
                                        <div className="card-header">
                                            <h3>{dest.city}, {dest.country}</h3>
                                            <div className="price-tag">~${dest.estimatedFlightPrice}</div>
                                        </div>
                                        <p className="description">{dest.description}</p>
                                        <div className="activities">
                                            <h4>Top Activities</h4>
                                            <ul className="activities-list">
                                                {dest.activities.map((activity, i) => (
                                                    <li key={i}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="activity-icon">
                                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                                        </svg>
                                                        {activity}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}
            </div>
        )}
      </div>
    </main>
  );
};

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);