"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [venues, setVenues] = useState([]);
  const [bookingResult, setBookingResult] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [checkoutModal, setCheckoutModal] = useState(null);
  const [cancelConfirmModal, setCancelConfirmModal] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [activeLedger, setActiveLedger] = useState([]);
  const [courtBookings, setCourtBookings] = useState({});
  const [selectedDuration, setSelectedDuration] = useState({});
  
  const router = useRouter();

  const fetchAvailability = async () => {
    const token = localStorage.getItem('token');
    if (!token || venues.length === 0) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().split('T')[0];

    const bookingsMap = {};
    for (const venue of venues) {
      for (const court of venue.courts) {
        try {
          const res = await fetch(`http://localhost:3000/api/bookings/availability?courtId=${court.id}&date=${dateString}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            bookingsMap[court.id] = data.bookedSlots;
          }
        } catch (err) {
          console.error('Error fetching availability for court:', court.id, err);
        }
      }
    }
    setCourtBookings(bookingsMap);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch User Profile
        const userRes = await fetch('http://localhost:3000/api/users', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!userRes.ok) {
          throw new Error('Unauthorized');
        }
        const userData = await userRes.json();
        setUser(userData);

        // Fetch Venues
        const venuesRes = await fetch('http://localhost:3000/api/venues');
        const venuesData = await venuesRes.json();
        setVenues(venuesData);

        // Fetch Active Bookings for Ledger
        const bookingsRes = await fetch('http://localhost:3000/api/bookings/my', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          const ledgerItems = bookingsData.map(b => {
            const playerRecord = b.players.find(p => p.userId === userData.id);
            return {
              id: b.id,
              courtName: b.court.name,
              venueName: b.court.venue.name,
              timeframe: new Date(b.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
              amount: playerRecord ? playerRecord.amountPaid : b.totalAmount,
              status: b.status,
            };
          });
          setActiveLedger(ledgerItems);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        localStorage.removeItem('token');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  useEffect(() => {
    if (venues.length > 0) {
      fetchAvailability();
    }
  }, [venues]);

  const handleBookCourt = async (court, venue, bookingType = 'SOLO') => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setBookingLoading(true);
    setBookingResult(null);

    const duration = selectedDuration[court.id] || 1;

    // Book for tomorrow at 5 PM UTC
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(17, 0, 0, 0);
    const startTime = tomorrow.toISOString();

    const endTimeDate = new Date(tomorrow.getTime() + duration * 60 * 60 * 1000);
    const endTime = endTimeDate.toISOString();

    try {
      const response = await fetch('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          courtId: court.id,
          startTime,
          endTime,
          bookingType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details?.[0]?.message || 'Failed to book court');
      }

      const hourlyRate = Number(court.hourlyRate) > 0 ? Number(court.hourlyRate) : Number(court.basePrice);
      const totalBasePrice = duration * hourlyRate;
      const requiredPlayers = court.requiredPlayers || 4;
      const amountToPay = bookingType === 'COMMUNITY' ? (totalBasePrice / requiredPlayers) : totalBasePrice;

      setCheckoutModal({
        isOpen: true,
        courtName: court.name,
        venueName: venue.name,
        amount: amountToPay,
        paymentIntent: data.paymentIntent || data.id || `pi_${Math.random().toString(36).substring(2, 10)}`,
        startTime,
        endTime,
        bookingId: data.id,
        bookingType,
        requiredPlayers,
      });

    } catch (err) {
      setBookingResult({
        success: false,
        message: err.message,
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const handleConfirmAndPay = async () => {
    if (!checkoutModal) return;
    setProcessingPayment(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/bookings/confirm-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookingId: checkoutModal.bookingId,
        }),
      });

      if (!response.ok) {
        throw new Error('Payment confirmation failed. Please try again.');
      }

      const confirmedBooking = { ...checkoutModal };
      setCheckoutModal(null);
      
      const isCommunity = confirmedBooking.bookingType === 'COMMUNITY';
      
      setBookingResult({
        success: true,
        courtName: confirmedBooking.courtName,
        venueName: confirmedBooking.venueName,
        paymentIntent: confirmedBooking.paymentIntent,
        bookingType: confirmedBooking.bookingType,
      });
      
      setActiveLedger(prev => [...prev, {
        id: confirmedBooking.bookingId || Date.now(),
        courtName: confirmedBooking.courtName,
        venueName: confirmedBooking.venueName,
        timeframe: new Date(confirmedBooking.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        amount: confirmedBooking.amount,
        status: isCommunity ? 'GATHERING' : 'CONFIRMED',
      }]);
      
      fetchAvailability();

      setTimeout(() => setBookingResult(null), 8000);
    } catch (err) {
      setBookingResult({
        success: false,
        message: err.message,
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCancelPending = async () => {
    if (!checkoutModal) return;
    const bookingId = checkoutModal.bookingId;
    setCheckoutModal(null);

    try {
      const token = localStorage.getItem('token');
      await fetch('http://localhost:3000/api/bookings/cancel-pending', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ bookingId }),
      });
      
      fetchAvailability();
    } catch (err) {
      console.error('Failed to cancel pending booking:', err);
    }
  };

  const handleCancelBooking = async () => {
    if (!cancelConfirmModal) return;
    const item = cancelConfirmModal;
    setCancelConfirmModal(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3000/api/bookings/${item.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel booking');
      }

      const result = await response.json();

      // Update local ledger instantly
      setActiveLedger(prev => prev.filter(ledgerItem => ledgerItem.id !== item.id));

      // Fetch updated user profile data (for wallet balance!)
      if (token) {
        const userRes = await fetch('http://localhost:3000/api/users', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        }
      }

      // Fetch updated court availabilities
      fetchAvailability();

      setBookingResult({
        success: true,
        courtName: item.courtName,
        venueName: item.venueName,
        paymentIntent: result.refundAmount ? `Refunded $${Number(result.refundAmount).toFixed(2)}` : 'Cancelled and fully refunded',
        bookingType: 'CANCEL',
      });
      setTimeout(() => setBookingResult(null), 8000);

    } catch (err) {
      setBookingResult({
        success: false,
        message: err.message,
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Syncing Central Console...</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Header Panel */}
      <header className="glass-panel" style={styles.header}>
        <div style={styles.logoGroup}>
          <span style={styles.logoBadge}>OS</span>
          <h1 style={styles.headerTitle}>SportsOS Central</h1>
        </div>

        {user && (
          <div style={styles.profileArea}>
            <div style={styles.profileDetails}>
              <span style={styles.profileName}>{user.name}</span>
              <span style={styles.profileRole}>{user.role}</span>
            </div>
            <div style={styles.walletBadge}>
              <span style={styles.walletLabel}>Balance</span>
              <span style={styles.walletAmount}>${Number(user.walletBalance).toFixed(2)}</span>
            </div>
            <button onClick={handleLogout} className="btn" style={styles.logoutBtn}>
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* Main Grid */}
      <div style={styles.mainContent}>
        {/* Booking Notification Banner */}
        {bookingResult && (
          <div 
            className="animate-fade-in"
            style={{
              ...styles.alertBanner,
              ...(bookingResult.success ? styles.alertSuccess : styles.alertError)
            }}
          >
            {bookingResult.success ? (
              <div style={{ flex: 1 }}>
                <h3 style={{ fontWeight: '700', marginBottom: '4px', color: '#0f0', textShadow: '0 0 10px rgba(0, 255, 0, 0.5)' }}>
                  🎉 Booking {bookingResult.bookingType === 'COMMUNITY' ? 'Gathering Created!' : 'Confirmed!'}
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>
                  Successfully reserved <strong>{bookingResult.courtName}</strong> at <strong>{bookingResult.venueName}</strong>.
                </p>
                <div style={styles.tokenBox}>
                  <strong>Transaction ID:</strong> <code style={{ color: '#0f0' }}>{bookingResult.paymentIntent}</code>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <h3 style={{ fontWeight: '700', marginBottom: '4px' }}>⚠️ Reservation Conflict</h3>
                <p style={{ fontSize: '0.9rem' }}>{bookingResult.message}</p>
              </div>
            )}
            <button 
              onClick={() => setBookingResult(null)} 
              style={styles.closeAlert}
            >
              &times;
            </button>
          </div>
        )}

        <div style={styles.grid}>
          {/* Venues Grid */}
          <div style={styles.leftCol}>
            <h2 style={styles.sectionTitle}>Available Venues & Courts</h2>
            
            {venues.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No venues discovered.</p>
            ) : (
              venues.map((venue) => (
                <div key={venue.id} className="glass-panel" style={styles.venueCard}>
                  <div style={styles.venueHeader}>
                    <h3 style={styles.venueName}>{venue.name}</h3>
                    <span style={styles.venueAddress}>{venue.address}</span>
                  </div>

                  <div style={styles.courtList}>
                    {venue.courts.map((court) => {
                      const duration = selectedDuration[court.id] || 1;
                      const hourlyRate = Number(court.hourlyRate) > 0 ? Number(court.hourlyRate) : Number(court.basePrice);
                      const basePriceCalculated = duration * hourlyRate;

                      // Evaluate booking state for the next slot
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      tomorrow.setHours(17, 0, 0, 0);
                      const start = new Date(tomorrow);
                      const end = new Date(start.getTime() + duration * 60 * 60 * 1000);

                      const bookingsForCourt = courtBookings[court.id] || [];
                      const activeBooking = bookingsForCourt.find(b => {
                        const bStart = new Date(b.startTime);
                        const bEnd = new Date(b.endTime);
                        return bStart < end && bEnd > start;
                      });

                      let isConfirmed = false;
                      let isGathering = false;
                      let playersJoined = 0;
                      let reqPlayers = court.requiredPlayers || 4;

                      if (activeBooking) {
                        if (activeBooking.status === 'CONFIRMED') {
                          isConfirmed = true;
                        } else if (activeBooking.status === 'GATHERING') {
                          isGathering = true;
                          playersJoined = activeBooking.activePlayerCount || 1;
                        }
                      }

                      return (
                        <div key={court.id} className="glass-card" style={styles.courtCardDynamic}>
                          <div style={{ flex: 1 }}>
                            <h4 style={styles.courtName}>{court.name}</h4>
                            <span style={styles.sportBadge}>{court.sportType}</span>
                            
                            {/* Duration controls */}
                            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Duration:</label>
                              <select 
                                value={duration} 
                                onChange={(e) => setSelectedDuration(prev => ({ ...prev, [court.id]: parseFloat(e.target.value) }))}
                                style={styles.durationSelect}
                              >
                                <option value={1}>1.0 Hour</option>
                                <option value={1.5}>1.5 Hours</option>
                                <option value={2}>2.0 Hours</option>
                              </select>
                            </div>
                            
                            {isGathering && (
                              <div style={{ marginTop: '12px' }}>
                                <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>
                                  👥 {playersJoined}/{reqPlayers} Players Joined
                                </span>
                                <div className="progress-bar-container">
                                  <div 
                                    className="progress-bar-fill" 
                                    style={{ width: `${(playersJoined / reqPlayers) * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div style={styles.courtActionCol}>
                            <span style={styles.courtPrice}>${basePriceCalculated.toFixed(2)}</span>
                            
                            {isConfirmed ? (
                              <button 
                                className="btn btn-booked-red"
                                style={styles.bookBtn}
                                disabled
                              >
                                Fully Booked
                              </button>
                            ) : isGathering ? (
                              <button 
                                onClick={() => handleBookCourt(court, venue, 'COMMUNITY')}
                                className="btn btn-gathering-green"
                                style={styles.bookBtn}
                                disabled={bookingLoading}
                              >
                                {bookingLoading ? 'Joining...' : `Join Split ($${(basePriceCalculated / reqPlayers).toFixed(2)})`}
                              </button>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button 
                                  onClick={() => handleBookCourt(court, venue, 'SOLO')}
                                  className="btn btn-primary"
                                  style={{ ...styles.bookBtn, width: '150px' }}
                                  disabled={bookingLoading}
                                >
                                  Book Solo
                                </button>
                                <button 
                                  onClick={() => handleBookCourt(court, venue, 'COMMUNITY')}
                                  className="btn"
                                  style={{ ...styles.bookBtn, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', width: '150px' }}
                                  disabled={bookingLoading}
                                >
                                  Host Split
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Stats & Ledger Panel */}
          <div style={styles.rightCol}>
            <h2 style={styles.sectionTitle}>My Active Ledger</h2>
            <div className="glass-panel" style={{ ...styles.telemetryCard, marginBottom: '24px' }}>
              {activeLedger.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', margin: '16px 0' }}>No active reservations.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {activeLedger.map((item, idx) => (
                    <div 
                      key={item.id || idx} 
                      className={`glass-card ${item.status === 'GATHERING' ? 'ledger-gathering' : 'ledger-confirmed'}`} 
                      style={{ padding: '12px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{item.courtName}</span>
                        <span style={{ color: item.status === 'GATHERING' ? '#f59e0b' : 'var(--accent)', fontWeight: '700' }}>
                          ${Number(item.amount).toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.venueName}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.timeframe}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold', 
                            color: item.status === 'GATHERING' ? '#f59e0b' : 'var(--accent)',
                            textTransform: 'uppercase' 
                          }}>
                            {item.status === 'GATHERING' ? 'Gathering' : 'Confirmed'}
                          </span>
                          <button 
                            onClick={() => setCancelConfirmModal(item)}
                            className="btn btn-booked-red"
                            style={{
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h2 style={styles.sectionTitle}>System Telemetry</h2>
            <div className="glass-panel" style={styles.telemetryCard}>
              <div style={styles.telemetryStat}>
                <span style={styles.telemetryLabel}>Player Rating</span>
                <span style={styles.telemetryValue}>{user?.skillRating || 1200} ELO</span>
              </div>
              <div style={styles.telemetryDivider}></div>
              <div style={styles.telemetryStat}>
                <span style={styles.telemetryLabel}>Redis Locking Status</span>
                <span style={{ ...styles.telemetryValue, color: 'var(--accent)' }}>Active (Redlock)</span>
              </div>
              <div style={styles.telemetryDivider}></div>
              <div style={styles.telemetryStat}>
                <span style={styles.telemetryLabel}>Connected Gateway</span>
                <span style={styles.telemetryAddress}>http://localhost:3000</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Modal Overlay */}
      {checkoutModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={styles.modalBody}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: '1.4rem' }}>Checkout</h2>
              <button onClick={handleCancelPending} style={styles.closeAlert}>&times;</button>
            </div>
            
            <div style={styles.modalSection}>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Venue</span>
                <span style={styles.modalValue}>{checkoutModal.venueName}</span>
              </div>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Court</span>
                <span style={styles.modalValue}>{checkoutModal.courtName}</span>
              </div>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Total Amount</span>
                <span style={{ ...styles.modalValue, color: 'var(--accent)', fontSize: '1.2rem' }}>
                  ${Number(checkoutModal.amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div style={{ ...styles.modalSection, marginTop: '8px' }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>Payment Method</h3>
              <input type="text" className="input-field" placeholder="Card Number" defaultValue="4242 4242 4242 4242" style={{ marginBottom: '12px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <input type="text" className="input-field" placeholder="MM/YY" defaultValue="12/26" />
                <input type="text" className="input-field" placeholder="CVV" defaultValue="123" />
              </div>
              
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', height: '48px' }} 
                onClick={handleConfirmAndPay}
                disabled={processingPayment}
              >
                {processingPayment ? <div className="spinner-sm"></div> : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancelConfirmModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={styles.modalBody}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: '1.4rem', color: '#ef4444' }}>Cancel Booking</h2>
              <button onClick={() => setCancelConfirmModal(null)} style={styles.closeAlert}>&times;</button>
            </div>
            
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '8px' }}>
                Are you sure you want to cancel your reservation for <strong>{cancelConfirmModal.courtName}</strong>?
              </p>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Your funds of <strong style={{ color: 'var(--accent)' }}>${Number(cancelConfirmModal.amount).toFixed(2)}</strong> will be immediately refunded to your wallet balance.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
              <button 
                className="btn" 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }} 
                onClick={() => setCancelConfirmModal(null)}
              >
                No, Keep It
              </button>
              <button 
                className="btn btn-booked-red" 
                style={{ background: '#ef4444', color: '#fff' }} 
                onClick={handleCancelBooking}
              >
                Yes, Cancel & Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
  },
  wrapper: {
    padding: '24px',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    flex: 1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoBadge: {
    background: 'linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)',
    color: '#ffffff',
    padding: '6px 10px',
    borderRadius: '8px',
    fontFamily: 'var(--font-heading)',
    fontWeight: '800',
    fontSize: '0.9rem',
    letterSpacing: '0.05em',
  },
  headerTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.4rem',
    fontWeight: '800',
    color: '#ffffff',
  },
  profileArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  profileDetails: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
  profileName: {
    fontWeight: '600',
    fontSize: '0.95rem',
  },
  profileRole: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  walletBadge: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    padding: '8px 16px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  walletLabel: {
    fontSize: '0.7rem',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: '0.05em',
  },
  walletAmount: {
    fontFamily: 'var(--font-heading)',
    fontWeight: '700',
    fontSize: '1.1rem',
    color: '#ffffff',
  },
  logoutBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    padding: '8px 16px',
    fontSize: '0.85rem',
    fontWeight: '600',
    borderRadius: '8px',
  },
  mainContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '24px',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.2rem',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    letterSpacing: '0.02em',
  },
  venueCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  venueHeader: {
    borderBottom: '1px solid var(--border)',
    paddingBottom: '12px',
  },
  venueName: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.3rem',
    fontWeight: '700',
    color: '#ffffff',
  },
  venueAddress: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
  },
  courtList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  courtCardDynamic: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  courtActionCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
  },
  durationSelect: {
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid var(--border)',
    color: '#fff',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '0.8rem',
    outline: 'none',
  },
  courtName: {
    fontWeight: '600',
    fontSize: '1.05rem',
    color: '#ffffff',
  },
  sportBadge: {
    fontSize: '0.7rem',
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '3px 8px',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    display: 'inline-block',
    marginTop: '6px',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  courtPrice: {
    fontWeight: '700',
    fontSize: '1.25rem',
    color: '#ffffff',
  },
  bookBtn: {
    padding: '8px 16px',
    fontSize: '0.85rem',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  telemetryCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  telemetryStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  telemetryLabel: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  telemetryValue: {
    fontSize: '1.25rem',
    fontWeight: '700',
    fontFamily: 'var(--font-heading)',
  },
  telemetryDivider: {
    height: '1px',
    background: 'var(--border)',
  },
  telemetryAddress: {
    fontFamily: 'monospace',
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
  },
  alertBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px 24px',
    borderRadius: '12px',
    position: 'relative',
  },
  alertSuccess: {
    background: 'rgba(0, 255, 0, 0.1)',
    border: '1px solid rgba(0, 255, 0, 0.4)',
    color: '#0f0',
    boxShadow: '0 0 15px rgba(0, 255, 0, 0.2)',
  },
  alertError: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
  },
  closeAlert: {
    background: 'none',
    border: 'none',
    color: 'currentColor',
    fontSize: '1.5rem',
    cursor: 'pointer',
    opacity: '0.7',
    transition: 'opacity 0.2s',
  },
  tokenBox: {
    marginTop: '12px',
    background: 'rgba(0, 0, 0, 0.3)',
    padding: '8px 12px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    color: '#ffffff',
    border: '1px solid var(--border)',
  },
  modalBody: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '16px',
  },
  modalSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  modalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  modalLabel: {
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
  },
  modalValue: {
    fontWeight: '600',
  },
};
